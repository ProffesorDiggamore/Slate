import type { Editor, JSONContent } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection, type EditorState } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { AiError, AiNotReadyError, aiTransform, isAbort, type AiAction } from '../lib/ai/client'
import { openAiSettings } from '../lib/ai/store'
import { docToMarkdown } from '../lib/markdown/serialize'
import { toast } from '../lib/toasts'
import { parseAnswer, placeAnswer, selectedBlocks } from './aiPlace'
import { aiRuns, aiWritingKey, pendingRun, setRunProgress, stopRun, type AiMeta } from './extensions/aiWriting'

// The AI actions on selected text: send the selection (as Markdown, so lists and
// bold survive) to the user's AI, then swap the answer in as one undo step.
// "Continue writing" adds after the selection instead of replacing it.

/** How much of the page "Continue writing" sees before the cursor. */
const CONTEXT_CHARS = 8000

let nextId = 1

function toMarkdown(editor: Editor, content: Fragment): string {
  try {
    const json = (content.toJSON() ?? []) as JSONContent[]
    const blocks = json.every((n) => editor.schema.nodes[n.type!]?.isBlock) ? json : [{ type: 'paragraph', content: json }]
    return docToMarkdown({ type: 'doc', content: blocks }).trim()
  } catch {
    return content.textBetween(0, content.size, '\n\n').trim()
  }
}

/** Several table cells selected. Their from/to only cover one cell, so the
 *  rewrite actions (which replace from–to) leave them alone. */
export const isCellSelection = (state: EditorState) => state.selection instanceof CellSelection

/** The selected text as Markdown ("" when nothing is selected). Whole blocks, so
 *  three selected bullets read as a list, and table cells as a table. */
export function selectionMarkdown(editor: Editor): string {
  const { selection, doc } = editor.state
  if (selection.empty) return ''
  if (selection instanceof CellSelection) {
    const rows = selection.content().content
    const whole = doc.type.contentMatch.matchFragment(rows)?.validEnd
    return toMarkdown(editor, whole ? rows : Fragment.from(selection.$anchorCell.node(-1).copy(rows)))
  }
  return toMarkdown(editor, selectedBlocks(doc, selection.from, selection.to).content)
}

function finish(editor: Editor, id: number, action: AiAction, answer: string, original: string) {
  const pending = pendingRun(editor)
  if (!pending || pending.id !== id || editor.isDestroyed) return
  const { state } = editor
  // If the selection was edited while the AI was writing, keep both: the answer goes after it.
  const unchanged = state.doc.textBetween(pending.from, pending.to, '\n\n').trim() === original
  const replace = action !== 'continue' && unchanged
  const from = replace ? pending.from : pending.to
  const to = pending.to
  const tr = state.tr
  const landed = placeAnswer(tr, parseAnswer(state.schema, answer.trim()), from, to, replace)
  const meta: AiMeta = { end: id, fresh: landed }
  tr.setMeta(aiWritingKey, meta)
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(landed.to, tr.doc.content.size)), -1)).scrollIntoView()
  // One undo step: don't merge with typing just before, and seal it so typing just after starts a new one.
  editor.view.dispatch(closeHistory(tr))
  editor.view.dispatch(closeHistory(editor.state.tr))
  setTimeout(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(aiWritingKey, { fresh: null }))
  }, 1600)
}

export interface RunAiOptions {
  /** For 'translate'. */
  language?: string
}

/** Rewrites the selection (or continues from the cursor) with the user's AI. */
export async function runAiAction(editor: Editor, action: AiAction, opts: RunAiOptions = {}) {
  if (isCellSelection(editor.state)) {
    toast('The AI rewrites one cell at a time. Select the words inside a cell.')
    return
  }
  const current = pendingRun(editor)
  if (current) stopRun(editor.view, current.id)

  const { state } = editor
  const { empty, $from } = state.selection
  let { from, to } = state.selection
  let text = empty ? '' : selectionMarkdown(editor)
  if (empty && action === 'continue' && $from.parent.isTextblock) {
    // Nothing selected: carry on from the end of this line, not from the middle of a word.
    from = to = $from.end()
    text = $from.parent.textContent.trim()
  }
  const context =
    action === 'continue' ? toMarkdown(editor, state.doc.slice(0, to).content).slice(-CONTEXT_CHARS) : undefined
  if (!text && !context) {
    toast('Write or select some text first.')
    return
  }
  const original = state.doc.textBetween(from, to, '\n\n').trim()

  const id = nextId++
  const controller = new AbortController()
  aiRuns.set(id, { controller, editor })
  // Collapse the selection so the toolbar steps aside; the shimmer shows what's being rewritten.
  editor.view.dispatch(state.tr.setMeta(aiWritingKey, { start: { id, from, to } }).setSelection(TextSelection.near(state.doc.resolve(to), -1)))
  if (!editor.isFocused) editor.view.focus()

  try {
    const answer = await aiTransform(text, action, {
      signal: controller.signal,
      language: opts.language,
      context,
      onDelta: (soFar) => setRunProgress(id, soFar),
    })
    if (controller.signal.aborted) return
    if (!answer.trim()) toast('The AI didn’t send anything back. Try again?')
    else finish(editor, id, action, answer, original)
  } catch (err) {
    // Stop, or "Not now" on the consent prompt: nothing to say.
    if (controller.signal.aborted || isAbort(err)) return
    if (err instanceof AiNotReadyError || (err as Error)?.name === 'AiNotReadyError') {
      toast('Connect an AI to use this.', { action: { label: 'Set up AI', run: openAiSettings } })
    } else if (err instanceof AiError && (err.kind === 'auth' || err.kind === 'model')) {
      toast(err.message, { tone: 'error', action: { label: 'Set up AI', run: openAiSettings } })
    } else {
      toast((err as Error)?.message || 'The AI couldn’t finish that.', { tone: 'error' })
    }
  } finally {
    aiRuns.delete(id)
    if (!editor.isDestroyed && pendingRun(editor)?.id === id) editor.view.dispatch(editor.state.tr.setMeta(aiWritingKey, { end: id }))
  }
}

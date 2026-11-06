import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

// While the AI rewrites a selection, the text stays where it is with a soft
// shimmer and a small "Writing… Stop" pill after it. The range follows any
// edits made in the meantime, so the answer lands where the text is now.
// When it lands, the new text glows briefly so you can see what changed.

export interface AiRange {
  from: number
  to: number
}

interface Pending extends AiRange {
  id: number
}

interface AiState {
  pending: Pending | null
  fresh: AiRange | null
}

/** Set on a transaction to start a run, end one, and/or show (or clear) the just-written glow. */
export interface AiMeta {
  start?: Pending
  end?: number
  fresh?: AiRange | null
}

export const aiWritingKey = new PluginKey<AiState>('aiWriting')

interface Run {
  controller: AbortController
  editor: Editor
  label?: HTMLElement
}

/** Runs in flight, by id. The pill's Stop button and Escape look them up here. */
export const aiRuns = new Map<number, Run>()

export function pendingRun(editor: Editor): Pending | null {
  return aiWritingKey.getState(editor.state)?.pending ?? null
}

/** Stops a run and takes its shimmer away right now (the request may settle later). */
export function stopRun(view: EditorView, id: number) {
  aiRuns.get(id)?.controller.abort()
  aiRuns.delete(id)
  if (aiWritingKey.getState(view.state)?.pending?.id === id) view.dispatch(view.state.tr.setMeta(aiWritingKey, { end: id }))
}

/** Shows progress on the pill ("Writing… 24 words") as the answer streams in. */
export function setRunProgress(id: number, soFar: string) {
  const label = aiRuns.get(id)?.label
  if (!label) return
  const words = soFar.trim() ? soFar.trim().split(/\s+/).length : 0
  label.textContent = words ? `Writing… ${words} word${words === 1 ? '' : 's'}` : 'Writing…'
}

function pill(view: EditorView, id: number): HTMLElement {
  const el = document.createElement('span')
  el.className = 'ai-pill'
  el.contentEditable = 'false'
  el.setAttribute('role', 'status')
  const dot = document.createElement('span')
  dot.className = 'ai-pill-dot'
  const label = document.createElement('span')
  label.className = 'ai-pill-label'
  label.textContent = 'Writing…'
  const stop = document.createElement('button')
  stop.type = 'button'
  stop.className = 'ai-pill-stop'
  stop.textContent = 'Stop'
  stop.addEventListener('mousedown', (e) => e.preventDefault())
  stop.addEventListener('click', (e) => {
    e.preventDefault()
    stopRun(view, id)
  })
  el.append(dot, label, stop)
  const run = aiRuns.get(id)
  if (run) run.label = label
  return el
}

function mapRange<T extends AiRange>(r: T, tr: { mapping: { map: (pos: number, assoc?: number) => number } }): T {
  // Typing right at either edge stays outside the range.
  const from = tr.mapping.map(r.from, 1)
  const to = Math.max(from, tr.mapping.map(r.to, -1))
  return { ...r, from, to }
}

export const AiWriting = Extension.create({
  name: 'aiWriting',

  addProseMirrorPlugins() {
    return [
      new Plugin<AiState>({
        key: aiWritingKey,
        state: {
          init: () => ({ pending: null, fresh: null }),
          apply(tr, value) {
            let { pending, fresh } = value
            if (tr.docChanged) {
              if (pending) pending = mapRange(pending, tr)
              if (fresh) fresh = mapRange(fresh, tr)
            }
            const meta = tr.getMeta(aiWritingKey) as AiMeta | undefined
            if (meta?.start) pending = meta.start
            if (meta?.end !== undefined && pending?.id === meta.end) pending = null
            if (meta && 'fresh' in meta) fresh = meta.fresh ?? null
            return pending === value.pending && fresh === value.fresh ? value : { pending, fresh }
          },
        },
        props: {
          decorations(state) {
            const s = aiWritingKey.getState(state)
            if (!s || (!s.pending && !s.fresh)) return null
            const decos: Decoration[] = []
            const { pending, fresh } = s
            if (fresh && fresh.to > fresh.from) decos.push(Decoration.inline(fresh.from, fresh.to, { class: 'ai-fresh' }))
            if (pending) {
              if (pending.to > pending.from) decos.push(Decoration.inline(pending.from, pending.to, { class: 'ai-pending' }))
              decos.push(
                Decoration.widget(pending.to, (view) => pill(view, pending.id), {
                  side: 1,
                  key: `ai-pill-${pending.id}`,
                  ignoreSelection: true,
                  stopEvent: () => true,
                }),
              )
            }
            return DecorationSet.create(state.doc, decos)
          },
          handleKeyDown(view, event) {
            const pending = aiWritingKey.getState(view.state)?.pending
            if (!pending || event.key !== 'Escape') return false
            stopRun(view, pending.id)
            return true
          },
        },
      }),
    ]
  },

  onDestroy() {
    for (const [id, run] of aiRuns) {
      if (run.editor !== this.editor) continue
      run.controller.abort()
      aiRuns.delete(id)
    }
  },
})

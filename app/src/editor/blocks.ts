import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { imageToDataUrl, pickImageFile } from '../lib/images'
import { toast } from '../lib/toasts'

export type BlockKind = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'toggle' | 'bullet' | 'ordered' | 'task' | 'quote' | 'callout' | 'code'

export const BLOCK_LABELS: Record<BlockKind, string> = {
  paragraph: 'Text',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  toggle: 'Toggle list',
  bullet: 'Bulleted list',
  ordered: 'Numbered list',
  task: 'To-do list',
  quote: 'Quote',
  callout: 'Callout',
  code: 'Code',
}

export function currentBlock(editor: Editor): BlockKind {
  if (editor.isActive('codeBlock')) return 'code'
  if (editor.isActive('heading', { level: 1 })) return 'h1'
  if (editor.isActive('heading', { level: 2 })) return 'h2'
  if (editor.isActive('heading', { level: 3 })) return 'h3'
  if (editor.isActive('heading', { level: 4 })) return 'h4'
  if (editor.isActive('taskList')) return 'task'
  if (editor.isActive('orderedList')) return 'ordered'
  if (editor.isActive('bulletList')) return 'bullet'
  if (editor.isActive('callout', { kind: 'toggle' })) return 'toggle'
  if (editor.isActive('callout')) return 'callout'
  if (editor.isActive('blockquote')) return 'quote'
  return 'paragraph'
}

function unwrapLists(editor: Editor) {
  const c = editor.chain().focus()
  if (editor.isActive('taskList')) c.toggleTaskList()
  else if (editor.isActive('orderedList')) c.toggleOrderedList()
  else if (editor.isActive('bulletList')) c.toggleBulletList()
  c.run()
}

// Change the block under the cursor in place (works inside callouts too).
export function turnInto(editor: Editor, kind: BlockKind) {
  const chain = () => editor.chain().focus()
  // A whole callout/toggle picked from the block handle.
  const sel = editor.state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === 'callout') {
    if (kind === 'toggle' || kind === 'callout') {
      const toggle = kind === 'toggle'
      chain()
        .updateAttributes('callout', toggle ? { kind: 'toggle', fold: '+' } : { kind: 'note', fold: '' })
        .run()
      return
    }
    chain().setTextSelection(sel.from + 2).unsetCallout().run()
  }
  switch (kind) {
    case 'paragraph':
      unwrapLists(editor)
      if (editor.isActive('blockquote')) chain().lift('blockquote').run()
      chain().setParagraph().run()
      break
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
      unwrapLists(editor)
      chain()
        .setHeading({ level: Number(kind[1]) as 1 | 2 | 3 | 4 })
        .run()
      break
    case 'toggle':
      unwrapLists(editor)
      if (editor.isActive('codeBlock') || editor.isActive('heading')) chain().setParagraph().run()
      if (editor.isActive('callout')) {
        chain().updateAttributes('callout', { kind: 'toggle', fold: '+' }).run()
      } else {
        // Notion-style: the line you had becomes the toggle's summary.
        const { $from } = editor.state.selection
        const text = $from.parent.type.name === 'paragraph' ? $from.parent.textContent.trim() : ''
        chain().setCallout('toggle', '+').run()
        if (text) {
          const { $from: inner } = editor.state.selection
          const [start, end] = [inner.start(), inner.end()]
          chain()
            .command(({ tr }) => {
              tr.delete(start, end)
              return true
            })
            .updateAttributes('callout', { title: text })
            .run()
        }
      }
      break
    case 'bullet':
      if (editor.isActive('heading') || editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('bulletList')) chain().toggleBulletList().run()
      break
    case 'ordered':
      if (editor.isActive('heading') || editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('orderedList')) chain().toggleOrderedList().run()
      break
    case 'task':
      if (editor.isActive('heading') || editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('taskList')) chain().toggleTaskList().run()
      break
    case 'quote':
      unwrapLists(editor)
      if (editor.isActive('heading') || editor.isActive('codeBlock')) chain().setParagraph().run()
      if (!editor.isActive('blockquote')) chain().toggleBlockquote().run()
      break
    case 'callout':
      unwrapLists(editor)
      if (editor.isActive('codeBlock')) chain().setParagraph().run()
      if (editor.isActive('callout', { kind: 'toggle' })) chain().updateAttributes('callout', { kind: 'note', fold: '' }).run()
      else if (!editor.isActive('callout')) chain().setCallout('note').run()
      break
    case 'code':
      unwrapLists(editor)
      if (!editor.isActive('codeBlock')) chain().toggleCodeBlock().run()
      break
  }
}

export function insertTable(editor: Editor) {
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

export function insertImage(editor: Editor) {
  const src = window.prompt('Image link (https://…)')?.trim()
  if (src) editor.chain().focus().setImage({ src }).run()
}

/** Pick a picture from this device and put it in the note. */
export async function uploadImage(editor: Editor) {
  const file = await pickImageFile()
  if (!file) return
  try {
    const src = await imageToDataUrl(file)
    editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, '') }).run()
  } catch {
    toast('That picture couldn’t be opened. Try a PNG or JPEG.')
  }
}

export function insertNow(editor: Editor) {
  const t = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  editor.chain().focus().insertContent(t + ' ').run()
}

export function insertCallout(editor: Editor, kind: string) {
  turnInto(editor, 'callout')
  if (editor.isActive('callout')) editor.chain().focus().updateAttributes('callout', { kind }).run()
}

export function insertToday(editor: Editor) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  editor.chain().focus().insertContent(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `).run()
}

/** Makes this line a to-do (if it isn't one) and adds today's due date at its end, for the Tasks page. */
export function insertDue(editor: Editor) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const inTask = () => {
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type.name === 'taskItem') return true
    return false
  }
  if (!inTask()) turnInto(editor, 'task')
  const { $from } = editor.state.selection
  const text = $from.parent.textContent
  if (/📅\uFE0F?\s*\d{4}-\d{2}-\d{2}/u.test(text)) return
  editor
    .chain()
    .focus()
    .insertContentAt($from.end(), `${text && !text.endsWith(' ') ? ' ' : ''}📅 ${iso}`)
    .run()
}

export function startPageLink(editor: Editor) {
  editor.chain().focus().insertContent('[[').run()
}

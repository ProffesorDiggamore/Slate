import { Node } from '@tiptap/core'

// Markdown Slate doesn't have a visual block for (HTML, math, footnotes…)
// stays as editable source so nothing is lost on save.
export const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'pre[data-raw]', preserveWhitespace: 'full' }]
  },

  renderHTML() {
    return ['pre', { 'data-raw': '', class: 'raw-block', spellcheck: 'false' }, ['code', 0]]
  },
})

export const RawInline = Node.create({
  name: 'rawInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return { text: { default: '', parseHTML: (el) => el.textContent ?? '' } }
  },

  parseHTML() {
    return [{ tag: 'code[data-raw-inline]' }]
  },

  renderHTML({ node }) {
    return ['code', { 'data-raw-inline': '', class: 'raw-inline' }, node.attrs.text]
  },

  renderText({ node }) {
    return node.attrs.text
  },
})

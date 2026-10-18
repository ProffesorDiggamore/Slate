import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { markdownToDoc } from './parse'
import { docToMarkdown } from './serialize'
import { getField, joinFrontmatter, setField, splitFrontmatter } from './frontmatter'

const roundTrip = (md: string) => docToMarkdown(markdownToDoc(md))

// Text survives md -> doc -> md -> doc unchanged.
function plainText(doc: JSONContent): string {
  if (doc.type === 'text') return doc.text ?? ''
  if (doc.type === 'wikiLink') return `[[${doc.attrs?.target}]]`
  return (doc.content ?? []).map(plainText).join(doc.type === 'doc' ? '\n' : '')
}

describe('canonical markdown round-trips exactly', () => {
  const cases: Record<string, string> = {
    paragraphs: 'Hello world\n\nSecond paragraph\n',
    headings: '# One\n\n## Two\n\n### Three\n',
    marks: 'Some **bold**, *italic*, ~~strike~~, ==highlight==, `code` and <u>under</u>.\n',
    nestedMarks: '***both*** and **bold *inner* bold**\n',
    link: 'A [link](https://example.com) and https://bare.example.com/path here.\n',
    linkTitle: '[x](https://a.b "Title")\n',
    wikilinks: 'See [[Other Note]] and [[Folder/Note|alias]] and ![[image.png]].\n',
    wikiHeading: 'Jump to [[Note#Section]].\n',
    toggle: '> [!toggle]+ Packing list\n> Socks\n',
    toggleClosed: '> [!toggle]- Hidden\n> Inside\n',
    tasks: '- [ ] Open\n- [x] Done\n',
    bullets: '- one\n- two\n  - nested\n  - nested 2\n- three\n',
    ordered: '1. one\n2. two\n3. three\n',
    orderedStart: '3. three\n4. four\n',
    quote: '> Quote\n',
    quoteMulti: '> Line one\n>\n> Para two\n',
    callout: '> [!tip] Pro tip\n> Body text\n',
    calloutFold: '> [!warning]- Careful\n> Hidden body\n',
    calloutNoTitle: '> [!note]\n> Just body\n',
    code: '```ts\nconst a = 1\n```\n',
    codeBackticks: '````\n```\ninside\n```\n````\n',
    hr: 'above\n\n---\n\nbelow\n',
    table: '| Column A | Column B |\n| --- | --- |\n|  |  |\n',
    tableAlign: '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n',
    image: '![alt text](https://img.example/x.png)\n',
    hardBreaks: 'line one\nline two\n',
    emptyParas: 'a\n\n\n\nb\n',
    leadingEmpty: '\n\n## Heading\n',
    tags: '#tag and #another/tag\n',
    math: 'Inline $e^{i\\pi}+1=0$ math\n\n$$\n\\frac{a}{b}\n$$\n',
    html: '<details>\n<summary>Hi</summary>\nbody\n</details>\n',
    footnote: 'Text[^1]\n\n[^1]: The note\n',
    snake: 'snake_case_name stays\n',
    unicode: 'Émoji 🎉 and ünïcödé — fine\n',
  }
  for (const [name, md] of Object.entries(cases)) {
    it(name, () => expect(roundTrip(md)).toBe(md))
  }
})

describe('existing vault notes', () => {
  it('Welcome to Cairn', () => {
    const md = `This vault is a plain folder of markdown files. Cairn never puts your
notes anywhere you cannot reach them with Finder and a text editor.

## Try these

- Link a note by typing double brackets: [[Sync and Git]]
- \`⌘K\` opens the command palette, \`⌘O\` jumps to any note
- \`⌘N\` makes a new note, \`⌘E\` toggles preview

## Tasks work

- [x] Read this note
- [ ] Set up sync

> Everything stays on this device until you press Sync.
`
    expect(roundTrip(md)).toBe(md)
  })

  it('note with leading blank lines and table', () => {
    const md = '\n\n## Heading\n\n- [ ] New task\n\n| Column A | Column B |\n| --- | --- |\n|  |  |\n\n> Quote\n'
    expect(roundTrip(md)).toBe(md)
  })

  it('numbered list with bold', () => {
    const md = `1. Make a **private** repo on GitHub. Do not add a README.
2. Create a fine-grained Personal Access Token with **Contents: Read and write**
   scoped to just that repository.
3. Open Settings in Cairn and paste the repo URL, your username, and the token.
`
    expect(roundTrip(md)).toBe(md)
  })
})

describe('messy input becomes stable after one save', () => {
  const inputs = [
    '* star bullets\n* more\n\n+ plus\n',
    '__bold__ and _italic_\n',
    'Setext\n======\n',
    '- loose\n\n- list\n',
    '1) paren\n2) list\n',
    '- [ ] task\n- plain\n- [x] task\n',
    'trailing spaces   \nnext\n',
    '    indented code\n',
    '> quote\nlazy continuation\n',
    '<div>raw</div>\n\ntext &amp; entity &copy;\n',
    '[ref link][r]\n\n[r]: https://example.com\n',
    'a ** b ** c\n',
    '***\n___\n',
    '- a\n    - deep\n        - deeper\n',
  ]
  for (const md of inputs) {
    it(JSON.stringify(md), () => {
      const once = roundTrip(md)
      expect(roundTrip(once)).toBe(once)
    })
  }
})

describe('literal text is escaped so it stays text', () => {
  const texts = [
    '# not a heading',
    '- not a list',
    '1. not a list',
    '> not a quote',
    'a * b * c',
    '_under_ score',
    'brackets [[not a link]] here',
    '[text](not-a-link)',
    'a == b == c',
    '==not highlight==',
    '<b>not html</b>',
    '`not code`',
    'C:\\Users\\me',
    'ends with backslash \\',
    '~approx~ value',
    '$5 and $10',
    '$not math$',
    '[ ] not a task',
    '---',
    'AT&T &amp;',
  ]
  for (const t of texts) {
    it(JSON.stringify(t), () => {
      const doc: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }
      const md = docToMarkdown(doc)
      const back = markdownToDoc(md)
      expect(back.content).toHaveLength(1)
      expect(back.content![0].type).toBe('paragraph')
      expect(plainText(back)).toBe(t)
      expect(back.content![0].content).toHaveLength(1)
    })
  }
})

describe('editor structures serialize correctly', () => {
  it('marks with surrounding whitespace keep delimiters tight', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'say' },
            { type: 'text', text: ' hello ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'world' },
          ],
        },
      ],
    }
    expect(docToMarkdown(doc)).toBe('say **hello** world\n')
  })

  it('wikilink atoms', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'go ' },
            { type: 'wikiLink', attrs: { target: 'My Note', alias: null, embed: false } },
          ],
        },
      ],
    }
    expect(docToMarkdown(doc)).toBe('go [[My Note]]\n')
  })

  it('empty task item keeps its checkbox', () => {
    const md = '- [ ] \n'
    const doc = markdownToDoc('- [ ] a\n')
    doc.content![0].content![0].content = [{ type: 'paragraph' }]
    expect(docToMarkdown(doc)).toBe(md)
  })

  it('trailing empty paragraphs are dropped', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }, { type: 'paragraph' }, { type: 'paragraph' }],
    }
    expect(docToMarkdown(doc)).toBe('x\n')
  })

  it('empty doc is an empty file', () => {
    expect(docToMarkdown({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('')
    expect(markdownToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})

describe('frontmatter', () => {
  it('splits and joins', () => {
    const md = '---\nicon: "📚"\ntags: [a, b]\n---\n\nBody\n'
    const s = splitFrontmatter(md)
    expect(s.frontmatter).toBe('icon: "📚"\ntags: [a, b]')
    expect(s.body).toBe('Body\n')
    expect(joinFrontmatter(s.frontmatter, s.body)).toBe(md)
    expect(getField(s.frontmatter, 'icon')).toBe('📚')
  })

  it('sets and removes fields', () => {
    let fm = setField(null, 'icon', '🌲')
    expect(fm).toBe('icon: "🌲"')
    fm = setField('tags: x', 'icon', '🌲')
    expect(fm).toBe('icon: "🌲"\ntags: x')
    expect(setField(fm, 'icon', null)).toBe('tags: x')
    expect(setField('icon: a', 'icon', null)).toBe(null)
  })

  it('no frontmatter', () => {
    expect(splitFrontmatter('# Hi\n')).toEqual({ frontmatter: null, body: '# Hi\n' })
  })
})

describe('empty checkboxes', () => {
  it('stay checkboxes instead of turning into "\\[ ]" text', () => {
    expect(markdownToDoc('- [ ] ').content?.[0].type).toBe('taskList')
    expect(roundTrip('- [ ]\n')).toBe('- [ ] \n')
    expect(roundTrip('## Action items\n- [ ] \n- [x]\n')).toBe('## Action items\n\n- [ ] \n- [x] \n')
    expect(roundTrip('- [ ] real task\n- [ ] \n')).toBe('- [ ] real task\n- [ ] \n')
  })
})

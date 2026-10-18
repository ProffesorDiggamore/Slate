import { describe, expect, it } from 'vitest'
import { Keyring, isEncrypted, WrongPassphrase } from './crypto'
import { diffStats, foldContext, lineDiff } from './diff'
import { readProperties, renameProperty, setProperty, withHint } from './properties'
import { bucketOf, parseTasks, plainText, setTaskDone, setTaskDue, sortTasks } from './tasks'
import { baseVars, formatDate, renderTemplate, templatePaths } from './templates'

describe('tasks', () => {
  const note = [
    '---',
    'tags: [school]',
    '- [ ] not a task, this is frontmatter',
    '---',
    '# Plan',
    '- [ ] Math homework 📅 2026-10-20',
    '- [x] Email coach due 2026-10-01',
    '  * [ ] nested reading',
    '1. [ ] numbered one',
    '- [ ] ',
    '```',
    '- [ ] inside code',
    '```',
    'plain line',
  ].join('\n')

  it('finds checkboxes outside frontmatter and code, with their own due dates', () => {
    const tasks = parseTasks('Plan.md', note)
    expect(tasks.map((t) => [t.text, t.done, t.due, t.line])).toEqual([
      ['Math homework', false, '2026-10-20', 5],
      ['Email coach', true, '2026-10-01', 6],
      ['nested reading', false, null, 7],
      ['numbered one', false, null, 8],
    ])
  })

  it('gives daily-note tasks the note’s date unless they have their own', () => {
    const tasks = parseTasks('Daily/2026-10-18.md', '- [ ] Call grandma\n- [ ] Essay 📅 2026-10-25', '2026-10-18')
    expect(tasks.map((t) => [t.due, t.fromNote])).toEqual([
      ['2026-10-18', true],
      ['2026-10-25', false],
    ])
  })

  it('checks a task in place and refuses when the line changed', () => {
    const [math] = parseTasks('Plan.md', note)
    const done = setTaskDone(note, math, true)!
    expect(done.split('\n')[5]).toBe('- [x] Math homework 📅 2026-10-20')
    expect(setTaskDone(done.replace('Math homework', 'Science'), math, false)).toBeNull()
  })

  it('sets and clears a due date', () => {
    const [, , nested] = parseTasks('Plan.md', note)
    const withDue = setTaskDue(note, nested, '2026-11-02')!
    expect(withDue.split('\n')[7]).toBe('  * [ ] nested reading 📅 2026-11-02')
    const [math] = parseTasks('Plan.md', note)
    expect(setTaskDue(note, math, null)!.split('\n')[5]).toBe('- [ ] Math homework')
  })

  it('shows task text without Markdown marks', () => {
    expect(plainText('Read [[Book Notes|the book]] and [[Ch 4#Intro]], **really** ==now== `code` [site](https://x.y)')).toBe(
      'Read the book and Ch 4, really now code site',
    )
  })

  it('buckets and sorts by due date', () => {
    const tasks = sortTasks(parseTasks('Plan.md', note))
    expect(tasks.map((t) => bucketOf(t, '2026-10-20'))).toEqual(['done', 'today', 'someday', 'someday'])
    expect(bucketOf({ ...tasks[1], due: '2026-10-19' }, '2026-10-20')).toBe('overdue')
    expect(bucketOf({ ...tasks[1], due: '2026-10-21' }, '2026-10-20')).toBe('upcoming')
  })
})

describe('templates', () => {
  const day = new Date(2026, 9, 18, 9, 5)
  it('fills Obsidian-style placeholders and leaves unknown ones alone', () => {
    const out = renderTemplate('# {{title}}\n{{date}} {{weekday}} {{time}}\n{{date:dddd, MMMM D}}\n{{mystery}}', baseVars(day, 'Plan', day), day)
    expect(out).toBe('# Plan\n2026-10-18 Sunday 09:05\nSunday, October 18\n{{mystery}}')
  })
  it('formats 12-hour times and short names', () => {
    expect(formatDate(new Date(2026, 0, 3, 15, 7), 'ddd MMM D YY h:mm A')).toBe('Sat Jan 3 26 3:07 PM')
  })
  it('lists notes in the templates folder only', () => {
    expect(templatePaths(['Templates/Daily.md', 'Templatesque.md', 'Templates/x/Meet.md', 'a.md'], 'Templates/')).toEqual([
      'Templates/Daily.md',
      'Templates/x/Meet.md',
    ])
  })
})

describe('properties', () => {
  const fm = ['title: My trip', 'tags:', '  - travel', '  - "2026"', 'done: false', 'due: 2026-10-20', 'count: 3', 'aliases: [a, "b, c"]', 'nested:', '  key: value', '# a comment', 'icon: 🎒'].join(
    '\n',
  )

  it('reads simple values, lists and types, and keeps unknown shapes read-only', () => {
    expect(readProperties(fm)).toEqual([
      { key: 'title', type: 'text', value: 'My trip' },
      { key: 'tags', type: 'list', value: ['travel', '2026'] },
      { key: 'done', type: 'checkbox', value: false },
      { key: 'due', type: 'date', value: '2026-10-20' },
      { key: 'count', type: 'number', value: '3' },
      { key: 'aliases', type: 'list', value: ['a', 'b, c'] },
      { key: 'nested', type: 'complex', value: 'key: value' },
      { key: 'icon', type: 'text', value: '🎒' },
    ])
  })

  it('changes one key without touching the others', () => {
    const next = setProperty(fm, 'done', true, 'checkbox')!
    expect(next.split('\n').filter((l, i) => l !== fm.split('\n')[i])).toEqual(['done: true'])
    expect(setProperty(fm, 'tags', ['a', 'b c'], 'list')).toContain('tags:\n  - a\n  - b c\ndone: false')
  })

  it('quotes text that YAML would misread', () => {
    expect(setProperty(null, 'note', 'yes', 'text')).toBe('note: "yes"')
    expect(setProperty(null, 'time', 'at 10: 30', 'text')).toBe('time: "at 10: 30"')
    expect(setProperty(null, 'code', '0042', 'text')).toBe('code: "0042"')
    expect(readProperties(setProperty(null, 'q', '"quoted" #tag', 'text'))[0].value).toBe('"quoted" #tag')
  })

  it('reads empty and quoted values through the remembered type', () => {
    const [empty, quoted, date] = readProperties('score:\nrank: "2"\nwhen: "2026-10-20"')
    expect(withHint(empty, 'number')).toEqual({ key: 'score', type: 'number', value: '' })
    expect(withHint(empty, 'checkbox')).toEqual({ key: 'score', type: 'checkbox', value: false })
    expect(withHint(quoted, 'number').type).toBe('number')
    expect(withHint(date, 'date').type).toBe('date')
    expect(withHint(quoted, 'date')).toBe(quoted)
    expect(setProperty('rank: "2"', 'rank', '3', withHint(quoted, 'number').type)).toBe('rank: 3')
  })

  it('adds, removes and renames', () => {
    expect(setProperty('a: 1', 'b', 'two')).toBe('a: 1\nb: two')
    expect(setProperty('a: 1\nb: two', 'a', null)).toBe('b: two')
    expect(setProperty('a: 1', 'a', null)).toBeNull()
    expect(renameProperty(fm, 'count', 'pages')).toContain('pages: 3')
    expect(renameProperty('a: 1\nb: 2', 'a', 'b')).toBe('a: 1\nb: 2')
  })
})

describe('encrypted pages', () => {
  it('round-trips, hides the text and rejects the wrong passphrase', async () => {
    const plain = '---\nicon: 🔒\n---\n\nMy locker code is 12-34-56 ✓'
    const sealed = await new Keyring('correct horse').seal(plain)
    expect(isEncrypted(sealed)).toBe(true)
    expect(sealed).not.toContain('locker')
    expect(sealed).toContain('cairn-encrypted: 1')
    expect(await new Keyring('correct horse').open(sealed)).toBe(plain)
    await expect(new Keyring('wrong').open(sealed)).rejects.toBeInstanceOf(WrongPassphrase)
  })

  it('reuses a page’s salt so later pages open with the same stretched key', async () => {
    const ring = new Keyring('pw')
    const a = await ring.seal('one')
    const ring2 = new Keyring('pw')
    ring2.adoptSalt(a)
    const b = await ring2.seal('two')
    const salt = (s: string) => JSON.parse(atob(/```cairn-encrypted\n([\s\S]+?)\n```/.exec(s)![1].replace(/\n/g, ''))).salt
    expect(salt(b)).toBe(salt(a))
    expect(await ring.open(b)).toBe('two')
  })
})

describe('line diff', () => {
  it('marks added and removed lines and folds unchanged runs', () => {
    const a = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n')
    const b = ['1', '2', '3', '4', 'five', '6', '7', '8'].join('\n')
    const d = lineDiff(a, b)
    expect(diffStats(d)).toEqual({ added: 1, removed: 1 })
    expect(foldContext(d, 1)).toEqual([
      { kind: 'gap', count: 3 },
      { kind: 'same', text: '4' },
      { kind: 'del', text: '5' },
      { kind: 'add', text: 'five' },
      { kind: 'same', text: '6' },
      { kind: 'gap', count: 2 },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { build, groupLines, isTitleLike, suggestShape, type Line } from './restructure'

const t = (text: string, bold = false) => [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }]
const line = (text: string, bold = false): Line => ({ inline: t(text, bold), title: isTitleLike(t(text, bold)) })

// The note from the request: a bold title, then the steps.
const setup = [line('Setup', true), line('Get 2 Buckets, start filling one'), line('Get Pressure Washer and gun, fill other bucket'), line('Get hoses, and table')]

describe('turn lines into', () => {
  it('spots titles: all-bold lines and short lines ending in a colon', () => {
    expect(isTitleLike(t('Setup', true))).toBe(true)
    expect(isTitleLike(t('Things to bring:'))).toBe(true)
    expect(isTitleLike(t('Get hoses, and table'))).toBe(false)
    expect(isTitleLike([...t('half '), ...t('bold', true)])).toBe(false)
  })

  it('groups lines under their titles, and a lone title is just a line', () => {
    const groups = groupLines([...setup, line('Wash:'), line('Soap the car'), line('Rinse:')])
    expect(groups.map((g) => [g.title && (g.title.inline[0].text as string), g.items.length])).toEqual([
      ['Setup', 3],
      ['Wash:', 2],
    ])
    expect(suggestShape(groups)).toBe('toggle')
    expect(suggestShape(groupLines([line('a'), line('b')]))).toBe('bullet')
  })

  it('makes a toggle titled from the bold line, with the steps as bullets inside', () => {
    const [toggle] = build(groupLines(setup), 'toggle')
    expect(toggle.type).toBe('callout')
    expect(toggle.attrs).toEqual({ kind: 'toggle', fold: '+', title: 'Setup' })
    expect(toggle.content![0].type).toBe('bulletList')
    expect(toggle.content![0].content!.length).toBe(3)
  })

  it('builds headings with bullets, to-dos and plain lists', () => {
    const [h, ul] = build(groupLines(setup), 'heading')
    expect(h).toEqual({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Setup', marks: [] }] })
    expect(ul.type).toBe('bulletList')
    const [title, tasks] = build(groupLines(setup), 'task')
    expect(title.content![0].marks).toEqual([{ type: 'bold' }])
    expect(tasks.content!.every((i) => i.type === 'taskItem' && i.attrs!.checked === false)).toBe(true)
    expect(build(groupLines(setup), 'ordered')[1].type).toBe('orderedList')
  })

  it('uses the first line as the title when there isn’t one', () => {
    const [toggle] = build(groupLines([line('Groceries'), line('Milk'), line('Eggs')]), 'toggle')
    expect(toggle.attrs!.title).toBe('Groceries')
    expect(toggle.content![0].content!.length).toBe(2)
  })
})

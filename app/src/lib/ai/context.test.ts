import { describe, expect, it } from 'vitest'
import { buildContext, CONTEXT_LIMIT, findRelevantNotes, keywords } from './context'

const SEALED = '---\ncairn-encrypted: 1\n---\n\n> [!lock] Encrypted page\n\n```cairn-encrypted\nQUJDREVGRw==\n```\n'

const notes = [
  { path: 'Trips/Rome.md', content: '# Rome\nWe ate carbonara near the Pantheon and walked to the Colosseum.' },
  { path: 'Recipes/Carbonara.md', content: 'Eggs, pecorino, guanciale, pepper. No cream!' },
  { path: 'Work/Q3 plan.md', content: 'Ship the sync rewrite. Hire a designer.' },
  { path: 'Private/Diary.md', content: SEALED },
]

describe('keywords', () => {
  it('drops filler words and short words', () => {
    expect(keywords('What did I write about the trip to Rome?')).toEqual(['trip', 'rome'])
  })
})

describe('findRelevantNotes', () => {
  it('ranks notes matching more of the question first', () => {
    const found = findRelevantNotes(notes, 'where did we eat carbonara in Rome')
    expect(found[0].path).toBe('Trips/Rome.md')
    expect(found.map((f) => f.path)).toContain('Recipes/Carbonara.md')
    expect(found.map((f) => f.path)).not.toContain('Work/Q3 plan.md')
  })

  it('never offers an encrypted page', () => {
    expect(findRelevantNotes(notes, 'cairn encrypted lock diary').map((f) => f.path)).not.toContain('Private/Diary.md')
  })
})

describe('buildContext', () => {
  it('attaches a page with its title', () => {
    const ctx = buildContext({ attachPath: 'Work/Q3 plan.md' }, notes)
    expect(ctx.text).toContain('<attached_page title="Q3 plan">')
    expect(ctx.text).toContain('Hire a designer')
    expect(ctx.sources).toEqual([{ path: 'Work/Q3 plan.md', title: 'Q3 plan' }])
    expect(ctx.notes).toEqual([])
  })

  it('never sends an encrypted page, and says so', () => {
    const ctx = buildContext({ attachPath: 'Private/Diary.md' }, notes)
    expect(ctx.text).toBe('')
    expect(ctx.text).not.toContain('QUJD')
    expect(ctx.notes[0]).toMatch(/encrypted/)
  })

  it('trims a huge page and tells the user', () => {
    const big = [{ path: 'Big.md', content: 'x'.repeat(CONTEXT_LIMIT * 2) }]
    const ctx = buildContext({ attachPath: 'Big.md' }, big)
    expect(ctx.text.length).toBeLessThan(CONTEXT_LIMIT + 200)
    expect(ctx.notes).toContain('Page trimmed to fit')
  })

  it('adds note excerpts in search mode, skipping the attached page', () => {
    const ctx = buildContext({ attachPath: 'Trips/Rome.md', search: 'carbonara recipe' }, notes)
    expect(ctx.text).toContain('<note title="Carbonara">')
    expect(ctx.text.match(/Pantheon/g)).toHaveLength(1)
    expect(ctx.sources.map((s) => s.title)).toEqual(['Rome', 'Carbonara'])
  })

  it('reports an empty search', () => {
    expect(buildContext({ search: 'zebra quantum' }, notes).notes).toEqual(['No matching notes found'])
  })

  it('includes a selection', () => {
    expect(buildContext({ selection: '  the quick fox ' }, notes).text).toBe('<selection>\nthe quick fox\n</selection>')
  })
})

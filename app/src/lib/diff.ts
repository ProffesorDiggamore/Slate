import { diffComm } from 'node-diff3'

// Line-by-line differences for version history, with long unchanged runs
// folded down to a few lines of context.

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string }
export type DiffRow = DiffLine | { kind: 'gap'; count: number }

export function lineDiff(from: string, to: string): DiffLine[] {
  const out: DiffLine[] = []
  for (const chunk of diffComm(from.split('\n'), to.split('\n'))) {
    if ('common' in chunk && chunk.common) for (const text of chunk.common) out.push({ kind: 'same', text })
    else {
      const c = chunk as { buffer1?: string[]; buffer2?: string[] }
      for (const text of c.buffer1 ?? []) out.push({ kind: 'del', text })
      for (const text of c.buffer2 ?? []) out.push({ kind: 'add', text })
    }
  }
  return out
}

export function foldContext(lines: DiffLine[], context = 2): DiffRow[] {
  const changed = lines.map((l) => l.kind !== 'same')
  const keep = lines.map((_, i) => {
    for (let d = -context; d <= context; d++) if (changed[i + d]) return true
    return false
  })
  const out: DiffRow[] = []
  let gap = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (gap) out.push({ kind: 'gap', count: gap })
      gap = 0
      out.push(l)
    } else gap++
  })
  if (gap) out.push({ kind: 'gap', count: gap })
  return out
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return { added: lines.filter((l) => l.kind === 'add').length, removed: lines.filter((l) => l.kind === 'del').length }
}

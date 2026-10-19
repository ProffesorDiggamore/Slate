import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { buildLinkIndex, LinkResolver } from './links'
import { getField, splitFrontmatter } from './markdown/frontmatter'
import { useSettings } from './settings'
import { useVault } from './vault'
import { isEncrypted } from './crypto'

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia(q)
      m.addEventListener('change', fn)
      return () => m.removeEventListener('change', fn)
    },
    () => window.matchMedia(q).matches,
  )
}

export const useIsMobile = () => useMediaQuery('(max-width: 760px)')
export const useIsTouch = () => useMediaQuery('(hover: none) and (pointer: coarse)')

export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettings((s) => s.theme)
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
}

export function noteIcon(content: string): string | null {
  if (!content.startsWith('---')) return null
  return getField(splitFrontmatter(content).frontmatter, 'icon')
}

// Page icons for every note; recomputed only when some note content changes.
export function useNoteIcons(): Record<string, string> {
  const files = useVault((s) => s.files)
  const paths = useVault((s) => s.paths)
  return useMemo(() => {
    const out: Record<string, string> = {}
    for (const p of paths) {
      const icon = noteIcon(files[p]?.content ?? '')
      if (icon) out[p] = icon
    }
    return out
  }, [files, paths])
}

export function useResolver(): LinkResolver {
  const paths = useVault((s) => s.paths)
  return useMemo(() => new LinkResolver(paths), [paths])
}

// Link index is rebuilt lazily after edits settle.
export function useLinkIndex() {
  const files = useVault((s) => s.files)
  const paths = useVault((s) => s.paths)
  const [snap, setSnap] = useState(() => ({ files, paths }))
  useEffect(() => {
    const t = setTimeout(() => setSnap({ files, paths }), 400)
    return () => clearTimeout(t)
  }, [files, paths])
  return useMemo(() => buildLinkIndex(snap.paths.map((p) => ({ path: p, content: snap.files[p]?.content ?? '' }))), [snap])
}

export function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined })
}

/** Paths of encrypted pages (shown with a lock). */
export function useLockedPaths(): Set<string> {
  const files = useVault((s) => s.files)
  const paths = useVault((s) => s.paths)
  return useMemo(() => new Set(paths.filter((p) => isEncrypted(files[p]?.content ?? ''))), [files, paths])
}

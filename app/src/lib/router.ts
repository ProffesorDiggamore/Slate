import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'note'; path: string }
  | { name: 'graph' }
  | { name: 'trash' }
  | { name: 'tasks' }
  | { name: 'table'; folder: string }

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  if (h.startsWith('note/')) {
    try {
      return { name: 'note', path: decodeURIComponent(h.slice(5)) }
    } catch {
      return { name: 'home' }
    }
  }
  if (h === 'table' || h.startsWith('table/')) {
    try {
      return { name: 'table', folder: decodeURIComponent(h.slice(6)) }
    } catch {
      return { name: 'table', folder: '' }
    }
  }
  if (h === 'tasks') return { name: 'tasks' }
  if (h === 'graph') return { name: 'graph' }
  if (h === 'trash') return { name: 'trash' }
  return { name: 'home' }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'note':
      return '#/note/' + encodeURIComponent(route.path)
    case 'graph':
      return '#/graph'
    case 'trash':
      return '#/trash'
    case 'tasks':
      return '#/tasks'
    case 'table':
      return '#/table/' + encodeURIComponent(route.folder)
    default:
      return '#/'
  }
}

export function navigate(route: Route, { replace = false } = {}) {
  const href = hrefFor(route)
  if (location.hash === href) return
  if (replace) history.replaceState(null, '', href)
  else history.pushState(null, '', href)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export const openNote = (path: string, opts?: { replace?: boolean }) => navigate({ name: 'note', path }, opts)

let cached: { hash: string; route: Route } = { hash: '', route: { name: 'home' } }
function snapshot(): Route {
  if (cached.hash !== location.hash) cached = { hash: location.hash, route: parseHash(location.hash) }
  return cached.route
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn)
  window.addEventListener('popstate', fn)
  return () => {
    window.removeEventListener('hashchange', fn)
    window.removeEventListener('popstate', fn)
  }
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot)
}

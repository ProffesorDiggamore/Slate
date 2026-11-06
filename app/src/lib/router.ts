import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

export type Route =
  | { name: 'home' }
  | { name: 'note'; path: string }
  | { name: 'graph' }
  | { name: 'trash' }
  | { name: 'tasks' }
  | { name: 'table'; folder: string }
  | { name: 'ai' }

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
  if (h === 'ai') return { name: 'ai' }
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
    case 'ai':
      return '#/ai'
    case 'table':
      return '#/table/' + encodeURIComponent(route.folder)
    default:
      return '#/'
  }
}

/** How deep into Slate's own history this entry is, so Back knows whether there
 *  is an in-app page to go back to (a deep link starts at 0). */
const depth = (): number => (typeof history.state?.slateDepth === 'number' ? history.state.slateDepth : 0)

type StartViewTransition = (update: () => void) => unknown
type ViewTransitionHandle = { ready?: Promise<unknown>; finished?: Promise<unknown> }

/** On <html> while a route transition runs. base.css uses it to give the
 *  floating chrome (drawer, tab bar, toasts, install banner) View Transition
 *  groups of their own, drawn above the page's. Only while one runs: a named
 *  element is a backdrop root, so naming them all the time would flatten the
 *  glass inside them. */
const ROUTE_TRANSITION_CLASS = 'vt-active'
// Transitions can overlap (a newer one skips the older), so count them and
// drop the class only when the last one is done.
let running = 0

/** Route changes play as a View Transition (see base.css): the old page fades,
 *  the new one rises in. Skipped for replacements, reduced motion, hidden tabs
 *  and browsers without the API. Also skipped on phones, where the glass chrome
 *  (tab bar, floating top bar) sits over the page: a transition draws it as a
 *  flat picture for its duration, so the glass would flicker on every tab tap.
 *  There the new page rises in as it mounts instead (app.css). */
function transition(update: () => void) {
  const start = typeof document === 'undefined' ? undefined : (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition
  if (
    !start ||
    document.visibilityState !== 'visible' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
    window.matchMedia?.('(max-width: 760px)').matches
  )
    return update()
  // Set before starting, so the "before" picture already has the chrome in its
  // own groups: groups stack in the order they were first seen, and the page's
  // must come first.
  const root = document.documentElement
  running++
  root.classList.add(ROUTE_TRANSITION_CLASS)
  const done = () => {
    running = Math.max(0, running - 1)
    if (running === 0) root.classList.remove(ROUTE_TRANSITION_CLASS)
  }
  // flushSync so React commits the new page inside the callback, before the
  // browser takes its "after" picture. A transition that gets skipped (another
  // one started) still runs the callback; only its `ready` promise rejects.
  try {
    const vt = start.call(document, () => flushSync(update)) as ViewTransitionHandle | undefined
    vt?.ready?.catch(() => {})
    if (vt?.finished) vt.finished.then(done, done)
    else done()
  } catch {
    done()
    update()
  }
}

export interface NavigateOptions {
  replace?: boolean
  /** Switch without the page transition. For navigations that hand focus to the
   *  new page (a new page's title): iOS only raises the keyboard for a focus that
   *  happens inside the tap, and the transition commits the page a frame later. */
  instant?: boolean
}

export function navigate(route: Route, { replace = false, instant = false }: NavigateOptions = {}) {
  const href = hrefFor(route)
  if (location.hash === href) return
  // The address changes right away, so code that reads location.hash after
  // calling navigate() sees the new route; only the re-render waits for the
  // transition's callback (a frame later at most).
  if (replace) history.replaceState({ slateDepth: depth() }, '', href)
  else history.pushState({ slateDepth: depth() + 1 }, '', href)
  if (replace || instant) announce()
  else transition(announce)
}

/** Tell every useRoute() about our own navigation, right now. */
function announce() {
  announcing = true
  try {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } finally {
    announcing = false
  }
}

/** Back one step inside Slate, or Home when this page was opened directly. */
export function goBack() {
  if (depth() > 0) return history.back()
  // Replace this entry rather than add one, so Back doesn't bounce between them.
  history.replaceState({ slateDepth: 0 }, '', hrefFor({ name: 'home' }))
  transition(announce)
}

export const openNote = (path: string, opts?: NavigateOptions) => navigate({ name: 'note', path }, opts)

// One window listener feeds every useRoute(). Our own navigate() is already
// inside a transition, so it's passed straight through; Back / Forward (a
// popstate and a hashchange for the same step) get one transition of their own.
const listeners = new Set<() => void>()
let announcing = false
let pending = false

// The route useRoute() shows. It only moves on when listeners are told (inside
// the transition), not the moment the address changes, so an unrelated
// re-render in between (say, the drawer closing) can't draw the new page
// before the browser has taken its "before" picture.
let shown: { hash: string; route: Route } | null = null
function commit() {
  if (!shown || shown.hash !== location.hash) shown = { hash: location.hash, route: parseHash(location.hash) }
}
/** The route store behind useRoute(); exported for tests. */
export function routeSnapshot(): Route {
  if (!shown || listeners.size === 0) commit()
  return shown!.route
}
const notify = () => {
  commit()
  listeners.forEach((fn) => fn())
}

function onLocationChange(e: Event) {
  if (announcing) return notify()
  // Already showing this address: the hashchange that trails a popstate for the
  // same step, once that step is drawn. Nothing left to animate.
  if (!pending && shown?.hash === location.hash) return
  // The browser has already animated this step itself (a swipe back in Safari,
  // Android's predictive back). Playing ours on top would flash the page the
  // user just swiped away before the one they swiped to settles.
  if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) {
    pending = false
    return notify()
  }
  if (pending) return
  pending = true
  transition(() => {
    pending = false
    notify()
  })
}

export function subscribeRoute(fn: () => void) {
  if (listeners.size === 0) {
    window.addEventListener('hashchange', onLocationChange)
    window.addEventListener('popstate', onLocationChange)
  }
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) {
      window.removeEventListener('hashchange', onLocationChange)
      window.removeEventListener('popstate', onLocationChange)
    }
  }
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeRoute, routeSnapshot)
}

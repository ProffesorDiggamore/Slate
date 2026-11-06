import { afterEach, describe, expect, it, vi } from 'vitest'

// The router runs against window / location / history / document. Tests run in
// Node, so each one gets a small stand-in browser and a fresh copy of the module.

interface FakeTransition {
  update: () => void
  finish: () => void
  /** Whether the chrome already had its own groups when the transition started. */
  chromeNamedAtStart: boolean
}

async function setup({ viewTransitions = true } = {}) {
  vi.resetModules()
  const classes = new Set<string>()
  const transitions: FakeTransition[] = []
  const location = { hash: '#/' }
  const history = {
    state: null as unknown,
    pushState(state: unknown, _title: string, href: string) {
      this.state = state
      location.hash = href
    },
    replaceState(state: unknown, _title: string, href: string) {
      this.state = state
      location.hash = href
    },
  }
  const document = {
    visibilityState: 'visible',
    documentElement: {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
        contains: (c: string) => classes.has(c),
      },
    },
    startViewTransition: viewTransitions
      ? (update: () => void) => {
          let finish = () => {}
          const finished = new Promise<void>((resolve) => (finish = resolve))
          transitions.push({ update, finish, chromeNamedAtStart: classes.has('vt-active') })
          return { ready: Promise.resolve(), finished }
        }
      : undefined,
  }
  const window = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) })
  vi.stubGlobal('location', location)
  vi.stubGlobal('history', history)
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', window)
  vi.stubGlobal('HashChangeEvent', class extends Event {})

  const router = await import('./router')
  const seen: string[] = []
  router.subscribeRoute(() => seen.push(router.routeSnapshot().name))
  router.routeSnapshot()

  /** The browser stepping Back / Forward to `hash`: a popstate, then a hashchange. */
  const traverse = (hash: string, { uaAnimated = false } = {}) => {
    location.hash = hash
    const pop = new Event('popstate')
    if (uaAnimated) Object.defineProperty(pop, 'hasUAVisualTransition', { value: true })
    window.dispatchEvent(pop)
    window.dispatchEvent(new Event('hashchange'))
  }
  return { router, transitions, classes, seen, traverse, history }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('router transitions', () => {
  it('plays a navigation as a transition, with the chrome in its own groups only while it runs', async () => {
    const { router, transitions, classes, seen } = await setup()
    router.navigate({ name: 'tasks' })
    expect(transitions).toHaveLength(1)
    expect(transitions[0].chromeNamedAtStart).toBe(true)
    // The page itself only changes inside the transition's callback.
    expect(router.routeSnapshot().name).toBe('home')
    transitions[0].update()
    expect(seen).toEqual(['tasks'])
    expect(classes.has('vt-active')).toBe(true)
    transitions[0].finish()
    await settle()
    expect(classes.has('vt-active')).toBe(false)
  })

  it('keeps the chrome named until the last of two overlapping transitions ends', async () => {
    const { router, transitions, classes } = await setup()
    router.navigate({ name: 'tasks' })
    router.navigate({ name: 'graph' })
    expect(transitions).toHaveLength(2)
    transitions.forEach((t) => t.update())
    transitions[0].finish()
    await settle()
    expect(classes.has('vt-active')).toBe(true)
    transitions[1].finish()
    await settle()
    expect(classes.has('vt-active')).toBe(false)
  })

  it('opens a page instantly when asked, so focus given to it stays inside the tap', async () => {
    const { router, transitions, classes, seen, history } = await setup()
    router.openNote('Ideas.md', { instant: true })
    expect(transitions).toHaveLength(0)
    expect(classes.has('vt-active')).toBe(false)
    expect(seen).toEqual(['note'])
    expect(router.routeSnapshot()).toEqual({ name: 'note', path: 'Ideas.md' })
    // Still a real step in Slate's history, so Back returns from it.
    expect(history.state).toEqual({ slateDepth: 1 })
  })

  it('commits straight away without the View Transition API', async () => {
    const { router, classes, seen } = await setup({ viewTransitions: false })
    router.navigate({ name: 'trash' })
    expect(seen).toEqual(['trash'])
    expect(classes.has('vt-active')).toBe(false)
  })
})

describe('router Back / Forward', () => {
  it('gives a plain Back one transition for its popstate and hashchange', async () => {
    const { router, transitions, seen, traverse } = await setup()
    traverse('#/tasks')
    expect(transitions).toHaveLength(1)
    transitions[0].update()
    expect(seen).toEqual(['tasks'])
    // A hashchange that arrives after the step is drawn has nothing left to animate.
    window.dispatchEvent(new Event('hashchange'))
    expect(transitions).toHaveLength(1)
    expect(router.routeSnapshot().name).toBe('tasks')
  })

  it('shows a Back the browser already animated (a swipe) without replaying a transition', async () => {
    const { router, transitions, seen, traverse } = await setup()
    traverse('#/note/Ideas.md', { uaAnimated: true })
    expect(transitions).toHaveLength(0)
    expect(seen).toEqual(['note'])
    expect(router.routeSnapshot()).toEqual({ name: 'note', path: 'Ideas.md' })
  })
})

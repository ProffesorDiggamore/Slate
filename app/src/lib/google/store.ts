import { create } from 'zustand'
import { downloadIcs, openInGoogleCalendar, type CalendarEvent } from '../calendar'
import { setSettings, useSettings } from '../settings'
import { toast } from '../toasts'
import { deleteEvent, GoogleApiError, insertEvent, listCalendars, listEvents, type GCalendar, type GEvent } from './api'
import { connectGoogle, expireToken, googleConfigured, revokeGoogle, validToken } from './auth'

// Your Google calendars and events, held in memory only: never written to this
// device's storage, never sent anywhere but Google, gone when Cairn closes.

interface CalState {
  calendars: GCalendar[] | null
  events: GEvent[]
  range: { from: number; to: number } | null
  loading: boolean
  error: string | null
}

export const useGoogleCal = create<CalState>(() => ({ calendars: null, events: [], range: null, loading: false, error: null }))

/** Google Calendar is switched on for this copy of Cairn and connected on this device. */
export const googleConnected = () => googleConfigured() && !!useSettings.getState().google

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const hint = () => useSettings.getState().google?.email || null

function message(e: unknown): string {
  if (e instanceof GoogleApiError && e.status === 401) expireToken()
  return e instanceof Error ? e.message : String(e)
}

/** For loads: an expired sign-in isn't an error to show — the UI offers to sign back in. */
const loadError = (e: unknown) => {
  const text = message(e)
  return e instanceof GoogleApiError && e.status === 401 ? null : text
}

async function ensureCalendars(token: string): Promise<GCalendar[]> {
  const have = useGoogleCal.getState().calendars
  if (have) return have
  const cals = await listCalendars(token)
  useGoogleCal.setState({ calendars: cals })
  const g = useSettings.getState().google
  if (g && g.email === null) {
    // First time on this device: show the same calendars Google Calendar shows.
    setSettings({ google: { ...g, email: cals.find((c) => c.primary)?.id ?? '', hidden: cals.filter((c) => !c.selected).map((c) => c.id) } })
  }
  return cals
}

const touches = (e: GEvent, from: number, to: number) =>
  e.start.getTime() < to && (e.end.getTime() > from || (e.end.getTime() === e.start.getTime() && e.start.getTime() >= from))

let pending = 0
/**
 * Loads events between two dates from every calendar you've chosen to show and
 * merges them in, so the Home agenda and the Calendar can each load what they
 * show. Needs a token already.
 */
export async function loadGoogleRange(from: Date, to: Date) {
  const token = validToken()
  if (!token || !googleConnected()) return
  const f = from.getTime()
  const t = to.getTime()
  pending++
  useGoogleCal.setState({ loading: true, error: null, range: { from: f, to: t } })
  try {
    const cals = await ensureCalendars(token)
    const hidden = useSettings.getState().google?.hidden ?? []
    const shown = cals.filter((c) => !hidden.includes(c.id))
    const lists = await Promise.all(shown.map((c) => listEvents(token, c, from, to)))
    const ids = new Set(shown.map((c) => c.id))
    useGoogleCal.setState((s) => ({
      events: [...s.events.filter((e) => ids.has(e.calendarId) && !touches(e, f, t)), ...lists.flat()],
    }))
  } catch (e) {
    useGoogleCal.setState({ error: loadError(e) })
  } finally {
    useGoogleCal.setState({ loading: --pending > 0 })
  }
}

/** Loads your calendar list (for Settings). Needs a token already. */
export async function loadCalendars() {
  const token = validToken()
  if (!token || !googleConnected()) return
  try {
    await ensureCalendars(token)
  } catch (e) {
    useGoogleCal.setState({ error: loadError(e) })
  }
}

export function reloadGoogle() {
  const r = useGoogleCal.getState().range
  if (r) void loadGoogleRange(new Date(r.from), new Date(r.to))
}

/** The calendar new events go to: your pick, else your main calendar. */
export function targetCalendar(): GCalendar | null {
  const cals = useGoogleCal.getState().calendars ?? []
  const t = useSettings.getState().google?.target
  return cals.find((c) => c.id === t && c.writable) ?? cals.find((c) => c.primary && c.writable) ?? cals.find((c) => c.writable) ?? null
}

/** Signs in (from a click) and turns Google Calendar on for this device. */
export function connectGoogleCalendar() {
  connectGoogle({
    fresh: true,
    then: () => {
      if (!useSettings.getState().google) setSettings({ google: { email: null, hidden: [], target: null } })
      useGoogleCal.setState({ calendars: null, error: null })
      void loadCalendars().then(reloadGoogle)
    },
  })
}

/** Gets a fresh token (from a click) and reloads what's on screen. */
export function refreshGoogle() {
  connectGoogle({ hint: hint(), then: () => reloadGoogle() })
}

export async function disconnectGoogleCalendar() {
  await revokeGoogle()
  setSettings({ google: null })
  useGoogleCal.setState({ calendars: null, events: [], range: null, loading: false, error: null })
}

/**
 * Puts an event on Google Calendar without leaving Cairn. Call it from a click:
 * if the hour-long sign-in has run out, it signs in again first.
 */
export function addToGoogle(ev: CalendarEvent, { calendarId, onDone }: { calendarId?: string; onDone?: (ok: boolean) => void } = {}) {
  connectGoogle({
    hint: hint(),
    then: async (token) => {
      try {
        const cals = await ensureCalendars(token)
        const cal = cals.find((c) => c.id === calendarId && c.writable) ?? targetCalendar()
        if (!cal) throw new Error('You don’t have a Google calendar Cairn can add events to.')
        const created = await insertEvent(token, cal, ev, timeZone())
        if (created && !(useSettings.getState().google?.hidden ?? []).includes(cal.id)) {
          useGoogleCal.setState((s) => ({ events: [...s.events, created] }))
        }
        toast(`Added “${ev.title || 'Event'}” to ${cal.primary ? 'Google Calendar' : cal.name}`)
        onDone?.(true)
      } catch (e) {
        toast(message(e), { tone: 'error' })
        onDone?.(false)
      }
    },
  })
}

export function removeFromGoogle(e: GEvent) {
  connectGoogle({
    hint: hint(),
    then: async (token) => {
      try {
        await deleteEvent(token, e.calendarId, e.id)
        useGoogleCal.setState((s) => ({ events: s.events.filter((x) => !(x.id === e.id && x.calendarId === e.calendarId)) }))
        toast(`Deleted “${e.title}” from Google Calendar`)
      } catch (err) {
        toast(message(err), { tone: 'error' })
      }
    },
  })
}

/** The one-click "put this on my calendar": in-app when Google is connected, else the old ways. */
export function quickAddEvent(ev: CalendarEvent) {
  const app = useSettings.getState().calendarApp
  if (app === 'ics') downloadIcs(ev)
  else if (googleConnected()) addToGoogle(ev)
  else openInGoogleCalendar(ev)
}

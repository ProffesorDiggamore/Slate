import { endOf, isoDay, type CalendarEvent, type ClockTime } from '../calendar'

// Google Calendar's REST API, called straight from the browser with the
// signed-in user's token. The pure helpers at the bottom are unit-tested.

const BASE = 'https://www.googleapis.com/calendar/v3'

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface GCalendar {
  id: string
  name: string
  color: string
  primary: boolean
  writable: boolean
  selected: boolean // shown in Google Calendar's own sidebar
}

export interface GEvent {
  id: string
  calendarId: string
  title: string
  start: Date
  end: Date // exclusive
  allDay: boolean
  color: string
  link?: string
  location?: string
}

function friendly(status: number, msg: string): string {
  if (status === 401) return 'Google sign-in expired — reconnect to see your events.'
  if (status === 403) return msg.includes('insufficient') ? 'Slate needs calendar permission — reconnect and allow it.' : 'Google refused that (403).'
  if (status === 404) return 'That calendar or event no longer exists.'
  if (status === 429 || status >= 500) return 'Google Calendar is busy — try again in a moment.'
  return msg || `Google Calendar error ${status}`
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new GoogleApiError(0, 'Offline — Google Calendar needs a connection.')
  }
  if (!res.ok) {
    let msg = ''
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
      /* not json */
    }
    throw new GoogleApiError(res.status, friendly(res.status, msg))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

interface RawCalendar {
  id: string
  summary?: string
  summaryOverride?: string
  backgroundColor?: string
  primary?: boolean
  accessRole?: string
  selected?: boolean
  hidden?: boolean
}

export async function listCalendars(token: string): Promise<GCalendar[]> {
  const out: GCalendar[] = []
  let page: string | undefined
  do {
    const q = new URLSearchParams({ minAccessRole: 'reader', maxResults: '250', ...(page ? { pageToken: page } : {}) })
    const r = await call<{ items?: RawCalendar[]; nextPageToken?: string }>(token, 'GET', `/users/me/calendarList?${q}`)
    for (const c of r.items ?? []) {
      if (c.hidden) continue
      out.push({
        id: c.id,
        name: c.summaryOverride || c.summary || c.id,
        color: c.backgroundColor || '#4285f4',
        primary: !!c.primary,
        writable: c.accessRole === 'owner' || c.accessRole === 'writer',
        selected: c.selected !== false,
      })
    }
    page = r.nextPageToken
  } while (page)
  return out.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name))
}

export interface RawEvent {
  id: string
  status?: string
  summary?: string
  htmlLink?: string
  location?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

export async function listEvents(token: string, cal: GCalendar, from: Date, to: Date): Promise<GEvent[]> {
  const out: GEvent[] = []
  let page: string | undefined
  let pages = 0
  do {
    const q = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxResults: '250',
      ...(page ? { pageToken: page } : {}),
    })
    const r = await call<{ items?: RawEvent[]; nextPageToken?: string }>(token, 'GET', `/calendars/${encodeURIComponent(cal.id)}/events?${q}`)
    for (const raw of r.items ?? []) {
      const ev = fromGoogle(raw, cal)
      if (ev) out.push(ev)
    }
    page = r.nextPageToken
  } while (page && ++pages < 8)
  return out
}

export async function insertEvent(token: string, cal: GCalendar, ev: CalendarEvent, timeZone: string): Promise<GEvent | null> {
  const raw = await call<RawEvent>(token, 'POST', `/calendars/${encodeURIComponent(cal.id)}/events`, toGoogle(ev, timeZone))
  return fromGoogle(raw, cal)
}

export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  await call<void>(token, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
}

// ------------------------------------------------------------ pure helpers

const pad = (n: number) => String(n).padStart(2, '0')
const localDateTime = (d: Date, t: ClockTime) => `${isoDay(d)}T${pad(t.h)}:${pad(t.m)}:00`

/** A Slate event as the request body Google expects. */
export function toGoogle(ev: CalendarEvent, timeZone: string) {
  const e = endOf(ev)
  const when =
    ev.start && e.time
      ? { start: { dateTime: localDateTime(ev.date, ev.start), timeZone }, end: { dateTime: localDateTime(e.date, e.time), timeZone } }
      : { start: { date: isoDay(ev.date) }, end: { date: isoDay(e.date) } }
  return {
    summary: ev.title || 'Event',
    ...when,
    ...(ev.details ? { description: ev.details } : {}),
    ...(ev.location ? { location: ev.location } : {}),
  }
}

const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fromGoogle(raw: RawEvent, cal: Pick<GCalendar, 'id' | 'color'>): GEvent | null {
  if (raw.status === 'cancelled' || !raw.start || !raw.end) return null
  const allDay = !!raw.start.date
  const start = allDay ? parseDay(raw.start.date!) : new Date(raw.start.dateTime!)
  const end = allDay ? parseDay(raw.end.date!) : new Date(raw.end.dateTime!)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  return {
    id: raw.id,
    calendarId: cal.id,
    title: raw.summary?.trim() || '(No title)',
    start,
    end,
    allDay,
    color: cal.color,
    link: raw.htmlLink,
    location: raw.location,
  }
}

/** Events that touch `day` (local time), all-day ones first, then by start. */
export function eventsOn(events: GEvent[], day: Date): GEvent[] {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  return events
    .filter((e) => e.start < to && (e.end > from || (e.end.getTime() === e.start.getTime() && e.start >= from)))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime())
}

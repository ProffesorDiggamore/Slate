import { describe, expect, it } from 'vitest'
import { eventsOn, fromGoogle, toGoogle } from './api'

const cal = { id: 'me@example.com', color: '#4285f4' }

describe('toGoogle', () => {
  it('sends timed events as local wall-clock time plus the time zone', () => {
    const body = toGoogle({ title: 'Math', date: new Date(2026, 9, 14), start: { h: 13, m: 0 }, end: { h: 15, m: 30 } }, 'America/Denver')
    expect(body).toEqual({
      summary: 'Math',
      start: { dateTime: '2026-10-14T13:00:00', timeZone: 'America/Denver' },
      end: { dateTime: '2026-10-14T15:30:00', timeZone: 'America/Denver' },
    })
  })

  it('gives a lone start time an hour and rolls overnight events into the next day', () => {
    expect(toGoogle({ title: 'Call', date: new Date(2026, 9, 14), start: { h: 9, m: 15 }, end: null }, 'UTC').end).toEqual({
      dateTime: '2026-10-14T10:15:00',
      timeZone: 'UTC',
    })
    expect(toGoogle({ title: 'Shift', date: new Date(2026, 9, 31), start: { h: 22, m: 0 }, end: { h: 2, m: 0 } }, 'UTC').end).toEqual({
      dateTime: '2026-11-01T02:00:00',
      timeZone: 'UTC',
    })
  })

  it('uses dates with an exclusive end for all-day events, and keeps notes', () => {
    const body = toGoogle({ title: '', date: new Date(2026, 11, 31), start: null, end: null, details: 'bring snacks' }, 'UTC')
    expect(body).toEqual({ summary: 'Event', start: { date: '2026-12-31' }, end: { date: '2027-01-01' }, description: 'bring snacks' })
  })
})

describe('fromGoogle', () => {
  it('reads all-day dates as local days', () => {
    const e = fromGoogle({ id: '1', summary: ' Trip ', start: { date: '2026-10-14' }, end: { date: '2026-10-16' } }, cal)!
    expect(e.allDay).toBe(true)
    expect(e.title).toBe('Trip')
    expect(e.start).toEqual(new Date(2026, 9, 14))
    expect(e.end).toEqual(new Date(2026, 9, 16))
    expect(e.calendarId).toBe(cal.id)
  })

  it('skips cancelled and broken events and names untitled ones', () => {
    expect(fromGoogle({ id: '1', status: 'cancelled', start: { date: '2026-10-14' }, end: { date: '2026-10-15' } }, cal)).toBeNull()
    expect(fromGoogle({ id: '2' }, cal)).toBeNull()
    expect(fromGoogle({ id: '3', start: { dateTime: '2026-10-14T09:00:00Z' }, end: { dateTime: '2026-10-14T10:00:00Z' } }, cal)!.title).toBe('(No title)')
  })
})

describe('eventsOn', () => {
  const ev = (id: string, start: Date, end: Date, allDay = false) => ({ id, calendarId: 'c', title: id, start, end, allDay, color: '#000' })
  const events = [
    ev('late', new Date(2026, 9, 14, 18), new Date(2026, 9, 14, 19)),
    ev('early', new Date(2026, 9, 14, 8), new Date(2026, 9, 14, 9)),
    ev('trip', new Date(2026, 9, 13), new Date(2026, 9, 15), true),
    ev('yesterday', new Date(2026, 9, 13, 8), new Date(2026, 9, 13, 9)),
    ev('ends-at-midnight', new Date(2026, 9, 13, 22), new Date(2026, 9, 14)),
    ev('reminder', new Date(2026, 9, 14, 12), new Date(2026, 9, 14, 12)),
  ]

  it('finds every event touching the day, all-day first, then by start time', () => {
    expect(eventsOn(events, new Date(2026, 9, 14)).map((e) => e.id)).toEqual(['trip', 'early', 'reminder', 'late'])
  })

  it('treats all-day end dates as exclusive', () => {
    expect(eventsOn(events, new Date(2026, 9, 15)).map((e) => e.id)).toEqual([])
  })
})

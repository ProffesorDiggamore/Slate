import { CalendarDays, ChevronRight, ExternalLink, FilePen, FileText, RefreshCw } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { formatSpan, isoDay } from '../lib/calendar'
import { eventsOn, type GEvent } from '../lib/google/api'
import { googleConfigured, useGoogleAuth } from '../lib/google/auth'
import { loadGoogleRange, refreshGoogle, useGoogleCal } from '../lib/google/store'
import { openMeetingNote } from '../lib/meeting'
import { navigate, openNote } from '../lib/router'
import { useSettings } from '../lib/settings'
import { timesIn, useTasks } from '../lib/taskIndex'
import { bucketOf, sortTasks } from '../lib/tasks'
import { dailyNotePath, openDailyNote, useVault } from '../lib/vault'
import { TaskRow } from './TasksPage'
import { openMenu } from './ui'

// "Today" on the Home page: your Google events, the times in today's daily
// note, and to-dos due today or overdue — in one place.

const clock = (d: Date) => ({ h: d.getHours(), m: d.getMinutes() })

export function eventMenu(el: HTMLElement, e: GEvent) {
  openMenu(
    el,
    [
      { label: 'Meeting note', icon: <FilePen size={15} />, onSelect: () => openNote(openMeetingNote(e)) },
      ...(e.link ? [{ label: 'Open in Google Calendar', icon: <ExternalLink size={15} />, onSelect: () => void window.open(e.link, '_blank', 'noopener') }] : []),
    ],
    e.title,
  )
}

export function HomeAgenda() {
  const googleOn = useSettings((s) => !!s.google) && googleConfigured()
  const hasToken = useGoogleAuth((s) => !!s.token && s.expiresAt > Date.now() + 30_000)
  const signingIn = useGoogleAuth((s) => s.busy)
  const events = useGoogleCal((s) => s.events)
  const h24 = useSettings((s) => s.clock24)
  const bare = useSettings((s) => s.bareTimeRanges)
  const dailyFolder = useSettings((s) => s.dailyFolder)
  const tasks = useTasks()
  const now = new Date()
  const today = isoDay(now)
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const dailyPath = useMemo(() => dailyNotePath(new Date(dayStart)), [dayStart, dailyFolder]) // eslint-disable-line react-hooks/exhaustive-deps
  const daily = useVault((s) => s.files[dailyPath])

  useEffect(() => {
    if (googleOn && hasToken) void loadGoogleRange(new Date(dayStart), new Date(dayStart + 86_400_000))
  }, [googleOn, hasToken, dayStart])

  const todays = googleOn ? eventsOn(events, new Date(dayStart)) : []
  const times = daily && !daily.deleted ? timesIn(daily.content, bare) : []
  const due = sortTasks(tasks.filter((t) => ['overdue', 'today'].includes(bucketOf(t, today))))
  const nothing = !todays.length && !times.length && !due.length

  // Google events and the times in today's note, in one list by start time (all-day first).
  const rows = [
    ...todays.map((e) => ({
      at: e.allDay || e.start.getTime() < dayStart ? -1 : e.start.getHours() * 60 + e.start.getMinutes(),
      node: (
        <button key={e.calendarId + e.id} type="button" className="agenda-row" onClick={(ev) => eventMenu(ev.currentTarget, e)}>
          <span className="agenda-bar" style={{ background: e.color }} />
          <span className="agenda-time">{e.allDay ? 'All day' : formatSpan(clock(e.start), clock(e.end), h24)}</span>
          <span className="agenda-title">{e.title}</span>
        </button>
      ),
    })),
    ...times.map((t, i) => ({
      at: t.start.h * 60 + t.start.m,
      node: (
        <button key={'t' + i} type="button" className="agenda-row" onClick={() => openNote(openDailyNote())}>
          <span className="agenda-bar is-note" />
          <span className="agenda-time">{formatSpan(t.start, t.end, h24)}</span>
          <span className="agenda-title">{t.title}</span>
          <FileText size={13} className="muted" />
        </button>
      ),
    })),
  ].sort((a, b) => a.at - b.at)

  return (
    <section className="agenda">
      <h2 className="home-section">
        <CalendarDays size={15} /> Today
        <button type="button" className="link-btn agenda-more" onClick={() => navigate({ name: 'tasks' })}>
          All tasks <ChevronRight size={13} />
        </button>
      </h2>

      {googleOn && !hasToken && (
        <button type="button" className="btn btn-sm agenda-refresh" onClick={refreshGoogle} disabled={signingIn}>
          <RefreshCw size={14} /> Show today’s Google Calendar events
        </button>
      )}

      {rows.length > 0 && <div className="agenda-list">{rows.map((r) => r.node)}</div>}

      {due.length > 0 && (
        <div className="agenda-tasks">
          {due.slice(0, 6).map((t) => (
            <TaskRow key={t.path + ':' + t.line} task={t} today={today} />
          ))}
          {due.length > 6 && (
            <button type="button" className="link-btn" onClick={() => navigate({ name: 'tasks' })}>
              {due.length - 6} more due…
            </button>
          )}
        </div>
      )}

      {nothing && (
        <div className="agenda-empty">
          <span className="muted">Nothing scheduled today.</span>
          <button type="button" className="btn btn-sm" onClick={() => openNote(openDailyNote())}>
            <FileText size={14} /> {daily && !daily.deleted ? 'Open today’s note' : 'Start today’s note'}
          </button>
        </div>
      )}
    </section>
  )
}

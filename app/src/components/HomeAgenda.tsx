import { Clock, ExternalLink, FilePen, FileText, ListTodo, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { formatSpan, isoDay } from '../lib/calendar'
import { eventsOn, type GEvent } from '../lib/google/api'
import { googleConfigured, useGoogleAuth } from '../lib/google/auth'
import { loadGoogleRange, refreshGoogle, useGoogleCal } from '../lib/google/store'
import { relativeTime } from '../lib/hooks'
import { openMeetingNote } from '../lib/meeting'
import { titleOf } from '../lib/paths'
import { navigate, openNote } from '../lib/router'
import { useSettings } from '../lib/settings'
import { timesIn, toggleTask, useTasks } from '../lib/taskIndex'
import { bucketOf, plainText, sortTasks, type Task } from '../lib/tasks'
import { dailyNotePath, openDailyNote, useVault } from '../lib/vault'
import { dueLabel } from './TasksPage'
import { openMenu } from './ui'

// The two "what's on today" cards on Home: the schedule (Google events plus the
// times written in today's daily note) and the to-do card with checkboxes that
// tick the task off in its note.

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

const MAX_ROWS = 8

/** Today's events and note times. Renders nothing on a day with nothing scheduled. */
export function HomeAgenda({ style }: { style?: CSSProperties }) {
  const googleOn = useSettings((s) => !!s.google) && googleConfigured()
  const hasToken = useGoogleAuth((s) => !!s.token && s.expiresAt > Date.now() + 30_000)
  const signingIn = useGoogleAuth((s) => s.busy)
  const events = useGoogleCal((s) => s.events)
  const h24 = useSettings((s) => s.clock24)
  const bare = useSettings((s) => s.bareTimeRanges)
  useSettings((s) => s.dailyFolder) // re-render when the daily folder moves
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const daily = useVault((s) => s.files[dailyNotePath(new Date(dayStart))])

  useEffect(() => {
    if (googleOn && hasToken) void loadGoogleRange(new Date(dayStart), new Date(dayStart + 86_400_000))
  }, [googleOn, hasToken, dayStart])

  const todays = googleOn ? eventsOn(events, new Date(dayStart)) : []
  const times = daily && !daily.deleted ? timesIn(daily.content, bare) : []

  // Google events and the times in today's note, in one list by start time (all-day first).
  const rows = [
    ...todays.map((e) => ({
      at: e.allDay || e.start.getTime() < dayStart ? -1 : e.start.getHours() * 60 + e.start.getMinutes(),
      node: (
        <button key={e.calendarId + e.id} type="button" className="home-agenda-row" onClick={(ev) => eventMenu(ev.currentTarget, e)}>
          <span className="home-agenda-bar" style={{ background: e.color }} />
          <span className="home-agenda-time">{e.allDay ? 'All day' : formatSpan(clock(e.start), clock(e.end), h24)}</span>
          <span className="home-agenda-title">{e.title}</span>
        </button>
      ),
    })),
    ...times.map((t, i) => ({
      at: t.start.h * 60 + t.start.m,
      node: (
        <button key={'t' + i} type="button" className="home-agenda-row" onClick={() => openNote(openDailyNote())}>
          <span className="home-agenda-bar is-note" />
          <span className="home-agenda-time">{formatSpan(t.start, t.end, h24)}</span>
          <span className="home-agenda-title">{t.title}</span>
          <FileText size={13} className="home-agenda-src" aria-label="From today’s note" />
        </button>
      ),
    })),
  ].sort((a, b) => a.at - b.at)

  // Nothing scheduled: no card at all. Due to-dos live in the to-do card.
  const needsSignIn = googleOn && !hasToken
  if (!rows.length && !needsSignIn) return null

  return (
    <section className="home-card home-agenda home-pop" style={style} aria-label="Today’s schedule">
      <div className="home-label">
        <Clock size={14} /> Schedule
        {rows.length > 0 && <span className="home-count">{rows.length}</span>}
      </div>
      {needsSignIn && (
        <button type="button" className="home-agenda-connect" onClick={refreshGoogle} disabled={signingIn}>
          <RefreshCw size={14} className={signingIn ? 'spin' : undefined} /> Show today’s Google Calendar events
        </button>
      )}
      {rows.length > 0 && <div className="home-agenda-list">{rows.slice(0, MAX_ROWS).map((r) => r.node)}</div>}
      {rows.length > MAX_ROWS && (
        <button type="button" className="home-link" onClick={() => openNote(openDailyNote())}>
          +{rows.length - MAX_ROWS} more
        </button>
      )}
    </section>
  )
}

// ------------------------------------------------------------------- to-do

const SHOWN = 5
const keyOf = (t: Task) => `${t.path}:${t.line}:${t.text}`

function without<T>(obj: Record<string, T>, key: string): Record<string, T> {
  if (!(key in obj)) return obj
  const next = { ...obj }
  delete next[key]
  return next
}

/**
 * Up to five open to-dos, due and overdue first. A ticked task stays a moment,
 * checked and struck through, then folds away — so the tap feels done rather
 * than the row vanishing under your finger.
 */
export function HomeTodo({ style }: { style?: CSSProperties }) {
  const tasks = useTasks()
  const files = useVault((s) => s.files)
  const today = isoDay(new Date())
  const [linger, setLinger] = useState<Record<string, 'done' | 'leaving'>>({})
  const timers = useRef(new Map<string, number[]>())

  useEffect(() => {
    const all = timers.current
    return () => all.forEach((ids) => ids.forEach(clearTimeout))
  }, [])

  const open = useMemo(() => tasks.filter((t) => !t.done), [tasks])
  const shown = useMemo(() => sortTasks(tasks.filter((t) => !t.done || linger[keyOf(t)])).slice(0, SHOWN), [tasks, linger])
  const more = open.length - shown.filter((t) => !t.done).length
  // When any page holding an open to-do last changed.
  const edited = open.reduce((m, t) => Math.max(m, files[t.path]?.mtime ?? 0), 0)

  const check = (t: Task, done: boolean) => {
    const key = keyOf(t)
    const before = useVault.getState().files[t.path]?.content
    toggleTask(t, done)
    // Unchanged means the line moved under us; toggleTask has already said so.
    if (useVault.getState().files[t.path]?.content === before) return
    timers.current.get(key)?.forEach(clearTimeout)
    timers.current.delete(key)
    if (!done) return setLinger((l) => without(l, key))
    setLinger((l) => ({ ...l, [key]: 'done' }))
    timers.current.set(key, [
      window.setTimeout(() => setLinger((l) => (key in l ? { ...l, [key]: 'leaving' } : l)), 1100),
      window.setTimeout(() => {
        timers.current.delete(key)
        setLinger((l) => without(l, key))
      }, 1480),
    ])
  }

  return (
    <section className="home-card is-filled home-todo home-pop" style={style} aria-label="To-do">
      <button type="button" className="home-label home-label-btn" onClick={() => navigate({ name: 'tasks' })}>
        <ListTodo size={14} /> To-do
        {open.length > 0 && <span className="home-count">{open.length}</span>}
      </button>

      {shown.length === 0 ? (
        <div className="home-todo-empty">
          <strong>Nothing to do 🎉</strong>
          {tasks.length === 0 && <span>Type [] in any page to add one.</span>}
        </div>
      ) : (
        <ul className="home-todo-list">
          {shown.map((t) => {
            const bucket = bucketOf(t, today)
            const label = plainText(t.text)
            return (
              <li key={keyOf(t)} className={'home-todo-row' + (t.done ? ' is-done' : '') + (linger[keyOf(t)] === 'leaving' ? ' is-leaving' : '')}>
                <label className="home-check">
                  <input type="checkbox" checked={t.done} onChange={(e) => check(t, e.target.checked)} aria-label={label} />
                  <span className="home-box" aria-hidden="true">
                    <svg viewBox="0 0 16 16">
                      <path d="M3.5 8.4l3 3 6-6.8" />
                    </svg>
                  </span>
                </label>
                <button type="button" className="home-todo-text" onClick={() => openNote(t.path)} title={`Open “${titleOf(t.path)}”`}>
                  <span className="home-todo-label">{label}</span>
                  {t.due && !t.done && <span className={'home-due is-' + bucket}>{dueLabel(t.due, today)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {(more > 0 || edited > 0) && (
        <div className="home-todo-foot">
          {more > 0 && (
            <button type="button" className="home-link" onClick={() => navigate({ name: 'tasks' })}>
              +{more} more
            </button>
          )}
          {edited > 0 && <span className="home-meta">Edited {relativeTime(edited)}</span>}
        </div>
      )}
    </section>
  )
}

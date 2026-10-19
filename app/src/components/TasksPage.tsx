import { CalendarClock, CircleCheckBig, ListTodo, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isoDay } from '../lib/calendar'
import { titleOf } from '../lib/paths'
import { openNote } from '../lib/router'
import { toggleTask, useTasks } from '../lib/taskIndex'
import { bucketOf, plainText, setTaskDue, sortTasks, type Task, type TaskBucket } from '../lib/tasks'
import { toast } from '../lib/toasts'
import { updateContent, useVault } from '../lib/vault'

// Every checkbox in every note, grouped by when it's due.

type Filter = 'open' | 'today' | 'overdue' | 'upcoming' | 'done'

const GROUPS: { id: TaskBucket; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'someday', label: 'No date' },
  { id: 'done', label: 'Done' },
]

const SHOWS: Record<Filter, TaskBucket[]> = {
  open: ['overdue', 'today', 'upcoming', 'someday'],
  today: ['overdue', 'today'],
  overdue: ['overdue'],
  upcoming: ['upcoming'],
  done: ['done'],
}

export function dueLabel(due: string, today: string): string {
  if (due === today) return 'Today'
  const d = new Date(`${due}T00:00`)
  const t = new Date(`${today}T00:00`)
  const days = Math.round((d.getTime() - t.getTime()) / 86_400_000)
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: days > 0 && days < 7 ? 'short' : undefined, month: 'short', day: 'numeric' })
}

function setDue(task: Task, due: string | null) {
  const f = useVault.getState().files[task.path]
  const next = f && !f.deleted ? setTaskDue(f.content, task, due) : null
  if (next === null) return toast('That task was just edited somewhere else — try again.', { tone: 'error' })
  updateContent(task.path, next)
}

export function TaskRow({ task, today, showNote = true }: { task: Task; today: string; showNote?: boolean }) {
  const bucket = bucketOf(task, today)
  return (
    <div className={'task-row' + (task.done ? ' is-done' : '')}>
      <input type="checkbox" className="task-check" checked={task.done} onChange={(e) => toggleTask(task, e.target.checked)} aria-label={task.text} />
      <span className="task-text">{plainText(task.text)}</span>
      {task.due && (
        <label className={'task-due is-' + bucket} title={task.fromNote ? 'From the daily note it’s in' : 'Change due date'}>
          <CalendarClock size={12} />
          {dueLabel(task.due, today)}
          {!task.fromNote && <input type="date" value={task.due} onChange={(e) => setDue(task, e.target.value || null)} />}
        </label>
      )}
      {!task.due && !task.done && (
        <label className="task-due is-add" title="Add a due date">
          <CalendarClock size={12} />
          <input type="date" onChange={(e) => e.target.value && setDue(task, e.target.value)} />
        </label>
      )}
      {task.due && !task.fromNote && !task.done && (
        <button type="button" className="icon-btn icon-btn-sm task-clear" title="Remove due date" onClick={() => setDue(task, null)}>
          <X size={13} />
        </button>
      )}
      {showNote && (
        <button type="button" className="task-note" onClick={() => openNote(task.path)}>
          {titleOf(task.path)}
        </button>
      )}
    </div>
  )
}

export function TasksPage() {
  const tasks = useTasks()
  const [filter, setFilter] = useState<Filter>('open')
  const today = isoDay(new Date())

  const grouped = useMemo(() => {
    const out = new Map<TaskBucket, Task[]>()
    for (const t of sortTasks(tasks)) {
      const b = bucketOf(t, today)
      out.set(b, [...(out.get(b) ?? []), t])
    }
    // Most recently due first for finished tasks.
    out.set('done', (out.get('done') ?? []).reverse())
    return out
  }, [tasks, today])

  const count = (b: TaskBucket) => grouped.get(b)?.length ?? 0
  const visible = GROUPS.filter((g) => SHOWS[filter].includes(g.id) && count(g.id) > 0)

  return (
    <div className="page tasks-page">
      <div className="page-inner">
        <h1 className="page-heading">
          <ListTodo size={26} strokeWidth={1.75} /> Tasks
        </h1>
        <p className="muted">
          Every to-do from every page. Add a due date by typing <code>📅 2026-10-20</code> (or <code>due 2026-10-20</code>) after a task, or with
          the calendar button here. To-dos in a daily note are due that day.
        </p>
        <div className="segmented tasks-filter">
          {(
            [
              ['open', `Open ${count('overdue') + count('today') + count('upcoming') + count('someday')}`],
              ['today', `Today ${count('overdue') + count('today')}`],
              ['overdue', `Overdue ${count('overdue')}`],
              ['upcoming', `Upcoming ${count('upcoming')}`],
              ['done', `Done ${count('done')}`],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <div className="empty-inline">
            <CircleCheckBig size={18} /> {tasks.length ? 'Nothing here — nice.' : 'No to-dos yet. Type [] at the start of a line in any page to make one.'}
          </div>
        ) : (
          visible.map((g) => (
            <section key={g.id} className="task-group">
              <h2 className={'home-section task-group-' + g.id}>
                {g.label} <span className="muted">{count(g.id)}</span>
              </h2>
              {grouped.get(g.id)!.slice(0, g.id === 'done' ? 100 : undefined).map((t) => (
                <TaskRow key={t.path + ':' + t.line} task={t} today={today} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  )
}

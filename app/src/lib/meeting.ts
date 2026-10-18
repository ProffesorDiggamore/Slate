import { formatTime, isoDay } from './calendar'
import type { GEvent } from './google/api'
import { getField, joinFrontmatter, setField, splitFrontmatter } from './markdown/frontmatter'
import { sanitizeFolder } from './paths'
import { useSettings } from './settings'
import { baseVars, renderTemplate } from './templates'
import { createNote, liveNotes, templateText } from './vault'

// A note for a calendar event, from the Meeting template. The event's id goes in
// the note's properties, so the same event always opens the same note.

export function meetingNoteFor(eventId: string): string | null {
  return liveNotes().find((f) => getField(splitFrontmatter(f.content).frontmatter, 'event-id') === eventId)?.path ?? null
}

export function meetingVars(ev: GEvent, h24: boolean): Record<string, string> {
  const clock = (d: Date) => formatTime({ h: d.getHours(), m: d.getMinutes() }, h24)
  return {
    ...baseVars(ev.start, ev.title),
    title: ev.title,
    event: ev.title,
    start: ev.allDay ? 'All day' : clock(ev.start),
    end: ev.allDay ? '' : clock(ev.end),
    location: ev.location ?? '',
    link: ev.link ?? '',
  }
}

/** Opens (creating if needed) the meeting note for an event; returns its path. */
export function openMeetingNote(ev: GEvent): string {
  const existing = meetingNoteFor(ev.id)
  if (existing) return existing
  const s = useSettings.getState()
  const vars = meetingVars(ev, s.clock24)
  const rendered = renderTemplate(templateText(s.meetingTemplate) ?? '', vars, ev.start)
  const split = splitFrontmatter(rendered)
  let fm = setField(split.frontmatter, 'event-id', ev.id)
  if (ev.link) fm = setField(fm, 'event-link', ev.link)
  fm = setField(fm, 'date', isoDay(ev.start))
  return createNote({
    folder: sanitizeFolder(s.meetingFolder),
    title: `${isoDay(ev.start)} ${ev.title}`.slice(0, 120),
    // Drop lines left empty by a missing place or an all-day event's end time.
    content: joinFrontmatter(fm, split.body.replace(/\*\*Where:\*\* *\n/, '').replace(/ – *\n/, '\n')),
  })
}

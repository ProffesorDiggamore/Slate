import { create } from 'zustand'
import type { ClockTime } from '../lib/calendar'

/** What the calendar opens with: an event form prefilled from a note line. */
export interface CalendarPrefill {
  title?: string
  date?: string // YYYY-MM-DD
  start?: ClockTime | null
  end?: ClockTime | null
  details?: string
}

interface UIState {
  palette: null | 'search' | 'commands'
  settings: boolean
  drawer: boolean // mobile sidebar
  calendar: null | CalendarPrefill
  history: null | string // path whose version history is open
}

export const useUI = create<UIState>(() => ({ palette: null, settings: false, drawer: false, calendar: null, history: null }))

export function openCalendar(prefill: CalendarPrefill = {}) {
  useUI.setState({ calendar: prefill, drawer: false })
}

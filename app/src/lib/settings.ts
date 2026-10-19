import { create } from 'zustand'
import type { PropType } from './properties'
import type { SyncConfig } from './types'

export type Theme = 'system' | 'light' | 'dark'
export type Font = 'sans' | 'serif' | 'mono' | 'rounded'
export type Palette = 'default' | 'paper' | 'slate' | 'forest' | 'rose' | 'oled'
export type PageWidth = 'narrow' | 'normal' | 'wide' | 'full'
export type Density = 'compact' | 'normal' | 'airy'

export const ACCENTS: { id: string; label: string; color: string }[] = [
  { id: 'blue', label: 'Blue', color: '#2383e2' },
  { id: 'purple', label: 'Purple', color: '#8b5cf6' },
  { id: 'pink', label: 'Pink', color: '#e255a1' },
  { id: 'red', label: 'Red', color: '#e03e3e' },
  { id: 'orange', label: 'Orange', color: '#e8730c' },
  { id: 'yellow', label: 'Gold', color: '#c9a227' },
  { id: 'green', label: 'Green', color: '#2f9e5a' },
  { id: 'teal', label: 'Teal', color: '#0f9b9b' },
  { id: 'graphite', label: 'Graphite', color: '#6b6b6b' },
]

export interface GoogleSettings {
  email: string | null // learned from the primary calendar after connecting
  hidden: string[] // calendar ids not shown in Slate
  target: string | null // where new events go (null = primary)
}

export interface Settings {
  theme: Theme
  palette: Palette
  accent: string // hex
  font: Font
  fontSize: number // editor text, px
  density: Density
  pageWidth: PageWidth
  /** @deprecated kept so older saved settings still load; see pageWidth */
  fullWidth: boolean
  /** @deprecated see fontSize */
  smallText: boolean
  spellcheck: boolean
  timeClocks: boolean // little clocks next to times like "1-3"
  bareTimeRanges: boolean // treat "1-3" (no am/pm) as a time
  clock24: boolean
  weekStartsMonday: boolean
  calendarApp: 'google' | 'ics'
  google: GoogleSettings | null // set once Google Calendar is connected on this device
  foldArrows: 'hover' | 'always'
  sync: SyncConfig | null
  favorites: string[]
  recent: string[]
  expanded: string[] // open folders in the sidebar
  sidebarOpen: boolean
  sidebarWidth: number
  dailyFolder: string
  templatesFolder: string
  dailyTemplate: string // template name for new daily notes ('' = start blank)
  meetingTemplate: string // template name for meeting notes from calendar events
  meetingFolder: string
  folderIcons: Record<string, string> // folder path -> icon, on this device
  propertyTypes: Record<string, PropType> // property name -> the type picked for it
  onboarded: boolean
}

const DEFAULTS: Settings = {
  theme: 'system',
  palette: 'default',
  accent: '#2383e2',
  font: 'sans',
  fontSize: 16,
  density: 'normal',
  pageWidth: 'normal',
  fullWidth: false,
  smallText: false,
  spellcheck: true,
  timeClocks: true,
  bareTimeRanges: true,
  clock24: false,
  weekStartsMonday: false,
  calendarApp: 'google',
  google: null,
  foldArrows: 'hover',
  sync: null,
  favorites: [],
  recent: [],
  expanded: [],
  sidebarOpen: true,
  sidebarWidth: 260,
  dailyFolder: 'Daily',
  templatesFolder: 'Templates',
  dailyTemplate: 'Daily',
  meetingTemplate: 'Meeting',
  meetingFolder: 'Meetings',
  folderIcons: {},
  propertyTypes: {},
  onboarded: false,
}

const KEY = 'cairn.settings.v1'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>
      const merged = { ...DEFAULTS, ...saved }
      // Carry the old on/off switches over to their newer settings once.
      if (saved.pageWidth === undefined && saved.fullWidth) merged.pageWidth = 'full'
      if (saved.fontSize === undefined && saved.smallText) merged.fontSize = 14
      return merged
    }
  } catch {
    /* private mode or corrupt */
  }
  return DEFAULTS
}

export const useSettings = create<Settings>(() => load())

useSettings.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked */
  }
})

export function setSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  useSettings.setState(typeof patch === 'function' ? patch(useSettings.getState()) : patch)
}

export function pushRecent(path: string) {
  setSettings((s) => ({ recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, 30) }))
}

export function renamePathInSettings(oldPath: string, newPath: string | null) {
  const swap = (list: string[]) => (newPath ? list.map((p) => (p === oldPath ? newPath : p)) : list.filter((p) => p !== oldPath))
  setSettings((s) => ({ favorites: swap(s.favorites), recent: swap(s.recent) }))
}

export function toggleFavorite(path: string) {
  setSettings((s) => ({ favorites: s.favorites.includes(path) ? s.favorites.filter((p) => p !== path) : [...s.favorites, path] }))
}

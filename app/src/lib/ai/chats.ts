// Conversations with the assistant, kept on this device only (localStorage
// `slate.ai.chats`). They are never synced to GitHub — a chat can quote
// private notes, and the repo is the user's notes, not app data.
import { create } from 'zustand'
import type { AiErrorKind } from './errors'

export interface ChatContextInfo {
  /** The page that went along (vault path) and its title at the time. */
  page?: string
  pageTitle?: string
  selection?: boolean
  searched?: boolean
  /** Notes found by "Search my notes", so the answer can be traced back. */
  sources?: { path: string; title: string }[]
  /** Things the user was told: "Page trimmed to fit", "… is encrypted". */
  notes?: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  time: number
  context?: ChatContextInfo
  /** Assistant only. */
  status?: 'streaming' | 'done' | 'stopped' | 'error'
  error?: { message: string; kind: AiErrorKind }
  /** Assistant only: the answer was cut off by the provider's length limit. */
  truncated?: boolean
}

export interface Chat {
  id: string
  title: string
  created: number
  updated: number
  messages: ChatMessage[]
  /** Context chips for the next message. */
  attachPath?: string | null
  selection?: string | null
  search?: boolean
}

const STORAGE_KEY = 'slate.ai.chats'
const MAX_CHATS = 60

interface ChatsState {
  chats: Chat[] // newest first
  /** The chat on screen. Not saved: a fresh visit after a restart starts a new chat. */
  currentId: string | null
}

function load(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as Chat[]) : []
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages)) : []
  } catch {
    return []
  }
}

export const useChats = create<ChatsState>(() => ({ chats: load(), currentId: null }))

/**
 * Runs `save` once changes settle for `wait` ms, but at least every `maxWait` ms
 * while they keep coming. A streaming answer changes every frame for as long as
 * it streams, so a plain debounce would write nothing until it ended.
 */
export function saveLater(save: () => void, wait: number, maxWait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let since = 0
  const flush = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
    save()
  }
  const schedule = () => {
    const now = Date.now()
    if (timer) clearTimeout(timer)
    else since = now
    timer = setTimeout(flush, Math.max(0, Math.min(wait, since + maxWait - now)))
  }
  return { schedule, flush }
}

// Save shortly after changes settle (not on every token), at least every 2 s
// while an answer streams, and straight away when the app is put away.
const saver = saveLater(persist, 600, 2000)
useChats.subscribe((s, prev) => {
  if (s.chats !== prev.chats) saver.schedule()
})

function persist() {
  // Empty chats aren't worth keeping; a half-streamed answer is saved as stopped.
  let list = useChats
    .getState()
    .chats.filter((c) => c.messages.length)
    .map((c) => ({ ...c, messages: c.messages.map((m) => (m.status === 'streaming' ? { ...m, status: 'stopped' as const } : m)) }))
    .slice(0, MAX_CHATS)
  for (let tries = 0; tries < 4; tries++) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      return
    } catch {
      // Full: drop the oldest half and try again.
      if (list.length <= 1) return
      list = list.slice(0, Math.ceil(list.length / 2))
    }
  }
}

// iOS can end a backgrounded app without firing pagehide, and an app that has
// been switched away from only ever sees visibilitychange, so flush on both.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', saver.flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saver.flush()
  })
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

export function getChat(id: string | null): Chat | undefined {
  return id ? useChats.getState().chats.find((c) => c.id === id) : undefined
}

/** Starts a new, empty chat and puts it on screen. */
export function startChat(init: Partial<Pick<Chat, 'attachPath' | 'selection' | 'search'>> = {}): Chat {
  const now = Date.now()
  const chat: Chat = { id: newId(), title: 'New chat', created: now, updated: now, messages: [], ...init }
  useChats.setState((s) => ({ chats: [chat, ...s.chats.filter((c) => c.messages.length || c.id === s.currentId)], currentId: chat.id }))
  return chat
}

export function updateChat(id: string, fn: (c: Chat) => Chat) {
  useChats.setState((s) => {
    const i = s.chats.findIndex((c) => c.id === id)
    if (i < 0) return s
    const next = fn(s.chats[i])
    const chats = [...s.chats]
    // A chat with new activity moves to the top of the history.
    if (next.updated !== s.chats[i].updated) {
      chats.splice(i, 1)
      chats.unshift(next)
    } else chats[i] = next
    return { chats }
  })
}

export function updateMessage(chatId: string, msgId: string, patch: Partial<ChatMessage>) {
  updateChat(chatId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }))
}

export function deleteChat(id: string) {
  useChats.setState((s) => ({ chats: s.chats.filter((c) => c.id !== id), currentId: s.currentId === id ? null : s.currentId }))
}

export function openChat(id: string | null) {
  useChats.setState({ currentId: id })
}

/** A short title from the first question. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 60 ? line.slice(0, 57).trimEnd() + '…' : line || 'New chat'
}

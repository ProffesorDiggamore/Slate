// Sending a message and streaming the answer into the chat store. This lives
// outside the page component so an answer keeps arriving if the user hops to
// a note and back; the Stop button reaches the same controller.
import { create } from 'zustand'
import { titleOf } from '../paths'
import { liveNotes } from '../vault'
import { getChat, newId, titleFrom, updateChat, updateMessage, type ChatMessage } from './chats'
import { AiConsentDeclinedError, AiError, AiNotReadyError, isAbort, streamChat } from './client'
import { buildContext } from './context'
import type { ChatTurn } from './transport'

const controllers = new Map<string, AbortController>()

/** Chats with an answer on its way, by chat id. */
export const useRunning = create<Record<string, true>>(() => ({}))

/** The conversation so far as provider turns (failed answers left out). */
function turnsOf(messages: ChatMessage[]): ChatTurn[] {
  return messages.filter((m) => m.role === 'user' || (m.status !== 'error' && m.text.trim())).map((m) => ({ role: m.role, content: m.text }))
}

function contextFor(chatId: string, question: string) {
  const chat = getChat(chatId)!
  return buildContext({ attachPath: chat.attachPath, selection: chat.selection, search: chat.search ? question : null }, liveNotes())
}

export function sendMessage(chatId: string, raw: string) {
  const chat = getChat(chatId)
  const text = raw.trim()
  if (!chat || !text || controllers.has(chatId)) return
  const ctx = contextFor(chatId, text)
  const now = Date.now()
  const user: ChatMessage = {
    id: newId(),
    role: 'user',
    text,
    time: now,
    context: {
      page: chat.attachPath ?? undefined,
      pageTitle: chat.attachPath ? titleOf(chat.attachPath) : undefined,
      selection: !!chat.selection,
      searched: !!chat.search,
      sources: ctx.sources.filter((s) => s.path !== chat.attachPath),
      notes: ctx.notes,
    },
  }
  const answer: ChatMessage = { id: newId(), role: 'assistant', text: '', time: now, status: 'streaming' }
  updateChat(chatId, (c) => ({ ...c, title: c.messages.length ? c.title : titleFrom(text), updated: now, messages: [...c.messages, user, answer] }))
  void run(chatId, answer.id, [...turnsOf(chat.messages), { role: 'user', content: text }], ctx.text)
}

/** Asks again for the last answer (the Regenerate pill, or Try again after an error). */
export function regenerate(chatId: string) {
  const chat = getChat(chatId)
  if (!chat || controllers.has(chatId)) return
  let last = chat.messages.length - 1
  while (last >= 0 && chat.messages[last].role !== 'user') last--
  if (last < 0) return
  const question = chat.messages[last]
  const ctx = contextFor(chatId, question.text)
  const now = Date.now()
  const answer: ChatMessage = { id: newId(), role: 'assistant', text: '', time: now, status: 'streaming' }
  const kept = chat.messages.slice(0, last + 1)
  updateChat(chatId, (c) => ({ ...c, updated: now, messages: [...kept, answer] }))
  void run(chatId, answer.id, turnsOf(kept), ctx.text)
}

export function stopChat(chatId: string) {
  controllers.get(chatId)?.abort()
}

async function run(chatId: string, msgId: string, history: ChatTurn[], context: string) {
  const ctrl = new AbortController()
  controllers.set(chatId, ctrl)
  useRunning.setState({ [chatId]: true })
  let text = ''
  // Paint at most once per frame however fast tokens arrive.
  let frame = 0
  const flush = () => {
    frame = 0
    updateMessage(chatId, msgId, { text })
  }
  const settle = (patch: Partial<ChatMessage>) => {
    cancelAnimationFrame(frame)
    updateMessage(chatId, msgId, { time: Date.now(), ...patch })
  }
  try {
    const r = await streamChat({
      history,
      context,
      signal: ctrl.signal,
      onText: (d) => {
        text += d
        if (!frame) frame = requestAnimationFrame(flush)
      },
    })
    settle({
      text,
      status: 'done',
      truncated: r.stop === 'length' || undefined,
      context: r.dropped ? { notes: ['Earlier messages were left out to fit'] } : undefined,
    })
  } catch (err) {
    if (err instanceof AiConsentDeclinedError) settle({ text: '', status: 'error', error: { message: 'Not sent — you chose “Not now”.', kind: 'other' } })
    else if (isAbort(err)) settle({ text, status: 'stopped' })
    else if (err instanceof AiNotReadyError)
      settle({ text: '', status: 'error', error: { message: 'Connect an AI first: add your key in Settings → AI.', kind: 'auth' } })
    // A refusal can come after partial output; that partial isn't a real answer.
    else if (err instanceof AiError && err.kind === 'refusal') settle({ text: '', status: 'error', error: { message: err.message, kind: 'refusal' } })
    else
      settle({
        text,
        status: 'error',
        error: { message: err instanceof Error ? err.message : 'Something went wrong.', kind: err instanceof AiError ? err.kind : 'other' },
      })
  } finally {
    controllers.delete(chatId)
    useRunning.setState((s) => {
      const next = { ...s }
      delete next[chatId]
      return next
    }, true)
  }
}

// The common shape every provider speaks, and the switch that picks one.
// Each provider module streams text deltas through `onText` and throws an
// AiError (or an AbortError when stopped). Claude's module is loaded lazily
// because it pulls in Anthropic's SDK.
import { listGeminiModels, streamGemini } from './gemini'
import { listOpenAIModels, streamOpenAI } from './openai'
import type { AiConnection } from './store'

export type Effort = 'low' | 'medium'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamRequest {
  system: string
  messages: ChatTurn[]
  /** 'medium' for chat, 'low' for quick rewrites. Only sent to models that take it. */
  effort: Effort
  signal?: AbortSignal
  onText: (delta: string) => void
}

export interface StreamResult {
  /** 'length' when the answer was cut off by the provider's output limit. */
  stop: 'end' | 'length'
}

export interface ModelOption {
  id: string
  label?: string
}

export async function streamCompletion(conn: AiConnection, key: string | null, req: StreamRequest): Promise<StreamResult> {
  switch (conn.kind) {
    case 'anthropic':
      return (await import('./anthropic')).streamClaude(conn, key ?? '', req)
    case 'gemini':
      return streamGemini(conn, key ?? '', req)
    default:
      return streamOpenAI(conn, key, req)
  }
}

export async function listModels(conn: AiConnection, key: string | null): Promise<ModelOption[]> {
  switch (conn.kind) {
    case 'anthropic':
      return (await import('./anthropic')).listClaudeModels(key ?? '')
    case 'gemini':
      return listGeminiModels(conn, key ?? '')
    default:
      return listOpenAIModels(conn, key)
  }
}

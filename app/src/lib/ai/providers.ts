// The AI services Slate can talk to. Everything is "bring your own key": the
// request goes straight from this device to the provider the user picked, with
// their key — Slate has no server in between and never sees the conversation.

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'other'

/** How a provider is called: Claude through Anthropic's SDK, the rest over plain HTTPS. */
export type ProviderKind = 'anthropic' | 'openai' | 'gemini'

export interface ProviderInfo {
  id: ProviderId
  /** What people call it ("ChatGPT"). */
  label: string
  /** Who runs it ("OpenAI") — the consent prompt names them. */
  company: string
  kind: ProviderKind
  baseUrl: string
  defaultModel: string
  keyUrl: string | null
  privacyUrl: string | null
  keyPlaceholder: string
}

export const CLAUDE_DEFAULT_MODEL = 'claude-opus-5-5'

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: 'openai',
    label: 'ChatGPT',
    company: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5',
    keyUrl: 'https://platform.openai.com/api-keys',
    privacyUrl: 'https://openai.com/policies/privacy-policy/',
    keyPlaceholder: 'sk-…',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude',
    company: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: CLAUDE_DEFAULT_MODEL,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    privacyUrl: 'https://www.anthropic.com/legal/privacy',
    keyPlaceholder: 'sk-ant-…',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    company: 'Google',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    // Google's moving alias for its current Flash model, so the default never goes stale.
    defaultModel: 'gemini-flash-latest',
    keyUrl: 'https://aistudio.google.com/apikey',
    privacyUrl: 'https://policies.google.com/privacy',
    keyPlaceholder: 'AIza…',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    company: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    // OpenRouter picks a suitable model per request.
    defaultModel: 'openrouter/auto',
    keyUrl: 'https://openrouter.ai/keys',
    privacyUrl: 'https://openrouter.ai/privacy',
    keyPlaceholder: 'sk-or-…',
  },
  other: {
    id: 'other',
    label: 'Other',
    company: 'Other',
    kind: 'openai',
    baseUrl: '',
    defaultModel: '',
    keyUrl: null,
    privacyUrl: null,
    keyPlaceholder: 'API key',
  },
}

export const PROVIDER_ORDER: ProviderId[] = ['openai', 'anthropic', 'gemini', 'openrouter', 'other']

export type PresetId = 'groq' | 'mistral' | 'deepseek' | 'xai' | 'ollama' | 'lmstudio' | 'custom'

/** OpenAI-compatible services offered under "Other". */
export interface Preset {
  id: PresetId
  label: string
  baseUrl: string
  needsKey: boolean
  defaultModel: string
  keyUrl: string | null
  privacyUrl: string | null
  /** Runs on the user's own computer. */
  local?: boolean
}

export const PRESETS: Preset[] = [
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    privacyUrl: 'https://groq.com/privacy-policy/',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    needsKey: true,
    defaultModel: 'mistral-large-latest',
    keyUrl: 'https://console.mistral.ai/api-keys',
    privacyUrl: 'https://mistral.ai/terms#privacy-policy',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    needsKey: true,
    defaultModel: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    privacyUrl: 'https://www.deepseek.com/',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    needsKey: true,
    defaultModel: 'grok-4',
    keyUrl: 'https://console.x.ai',
    privacyUrl: 'https://x.ai/legal/privacy-policy',
  },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', needsKey: false, defaultModel: 'llama3.2', keyUrl: null, privacyUrl: null, local: true },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', needsKey: false, defaultModel: '', keyUrl: null, privacyUrl: null, local: true },
  { id: 'custom', label: 'Custom URL', baseUrl: '', needsKey: true, defaultModel: '', keyUrl: null, privacyUrl: null },
]

export function presetById(id: PresetId): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1]
}

/** Strips trailing slashes so `${base}/models` never doubles up. */
export function cleanBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/**
 * The cleaned base URL when it's a full http(s) address with a host, else ''.
 * fetch() resolves anything else against the page: "api.example.com/v1" typed
 * without https:// would go to Slate's own website, key and notes included.
 */
export function httpBaseUrl(url: string): string {
  const clean = cleanBaseUrl(url)
  if (!/^https?:\/\//i.test(clean)) return ''
  try {
    return new URL(clean).hostname ? clean : ''
  } catch {
    return ''
  }
}

/**
 * True for an address on this device or the local network: localhost, the
 * private IPv4 ranges (10/8, 172.16/12, 192.168/16, link-local 169.254/16) and
 * *.local names. That's where Ollama or LM Studio runs, so no key is needed.
 */
export function isLocalUrl(url: string): boolean {
  let name: string
  try {
    name = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || name === '[::1]') return true
  // The URL parser has already normalised IPv4 (192.168.001.5 → 192.168.1.5).
  const ip = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(name)
  if (!ip) return false
  const a = Number(ip[1])
  const b = Number(ip[2])
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

// The assistant's settings and the entry points the rest of the app uses
// (Home's Ask card, the tab bar orb, the note page). Only non-secret choices
// live here, in localStorage `slate.ai.v1`: provider, model, base URL and which
// providers the user agreed to send messages to. API keys go through
// src/lib/secrets.ts (the Keychain in the iPhone/iPad app) and are never put in
// settings, synced to GitHub or logged.
import { create } from 'zustand'
import { navigate } from '../router'
import { useUI } from '../../components/uiState'
import { isNativeApp } from '../native'
import { getSecret, removeAllSecrets, removeSecret, setSecret } from '../secrets'
import { httpBaseUrl, isLocalUrl, PRESETS, presetById, PROVIDER_ORDER, PROVIDERS, type Preset, type PresetId, type ProviderId, type ProviderKind } from './providers'

export interface AiConfig {
  provider: ProviderId | null
  preset: PresetId
  customUrl: string
  /**
   * Where Ollama / LM Studio run, per preset, in the App Store app. On an iPhone
   * or iPad localhost is the device itself, so the user gives the computer's
   * address on their network. Unused on the website, which can only reach localhost.
   */
  localUrls: Record<string, string>
  /** The chosen model for each connection slot (see slotOf). */
  models: Record<string, string>
  /** Slots the user agreed to send messages to (App Store guideline 5.1.2(i)). */
  consent: Record<string, boolean>
  /** Which slots have a key saved. Only a yes/no — the key itself is in secrets. */
  keys: Record<string, boolean>
}

const STORAGE_KEY = 'slate.ai.v1'
const DEFAULTS: AiConfig = { provider: null, preset: 'groq', customUrl: '', localUrls: {}, models: {}, consent: {}, keys: {} }

function load(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<AiConfig>
    return {
      ...DEFAULTS,
      ...saved,
      provider: saved.provider && saved.provider in PROVIDERS ? saved.provider : null,
      preset: PRESETS.some((p) => p.id === saved.preset) ? saved.preset! : DEFAULTS.preset,
      localUrls: saved.localUrls && typeof saved.localUrls === 'object' ? saved.localUrls : {},
    }
  } catch {
    return DEFAULTS
  }
}

export const useAiConfig = create<AiConfig>(() => load())

useAiConfig.subscribe((s) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked: the choice still holds for this session */
  }
})

export function setAiConfig(patch: Partial<AiConfig> | ((s: AiConfig) => Partial<AiConfig>)) {
  useAiConfig.setState(patch)
}

/** One provider + endpoint combination. Keys, models and consent are kept per slot. */
export function slotOf(cfg: Pick<AiConfig, 'provider' | 'preset' | 'customUrl'>): string {
  if (cfg.provider !== 'other') return cfg.provider ?? ''
  if (cfg.preset !== 'custom') return `other:${cfg.preset}`
  return `other:custom:${hostOf(cfg.customUrl) || 'unset'}`
}

/** The host of a full http(s) address ("my-server.example:8080"), or '' when it isn't one. */
export function hostOf(url: string): string {
  const clean = httpBaseUrl(url)
  return clean ? new URL(clean).host : ''
}

export interface AiConnection {
  slot: string
  provider: ProviderId
  kind: ProviderKind
  /** Shown in the UI and the consent prompt: "Claude", "Groq", "my-server.example". */
  name: string
  /** Who receives the messages: "Anthropic", "Groq"… */
  company: string
  baseUrl: string
  model: string
  needsKey: boolean
  local: boolean
  privacyUrl: string | null
}

/** Where an "Other" service sends to, or '' when the address isn't usable (so nothing is sent). */
function presetBaseUrl(cfg: Pick<AiConfig, 'customUrl' | 'localUrls'>, preset: Preset, app = isNativeApp): string {
  if (preset.id === 'custom') return httpBaseUrl(cfg.customUrl)
  // The website's privacy lock only lets it reach localhost, so there the fixed
  // address is the only one that can work.
  if (!preset.local || !app) return preset.baseUrl
  // Only addresses on the local network: the consent prompt says "on your
  // computer" and no key is sent. A server on the internet is a Custom URL.
  const url = httpBaseUrl(cfg.localUrls[preset.id] ?? defaultLocalUrl(preset))
  return url && isLocalUrl(url) ? url : ''
}

/** What the "Computer address" starts as. On a Mac (the iPad app runs there too)
 *  the server is usually on the same machine, so localhost. On an iPhone or iPad
 *  localhost is the phone itself, which can't run Ollama: start empty so the user
 *  types the computer's address instead of sending into nothing. */
export function defaultLocalUrl(preset: Preset): string {
  const touchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  return isNativeApp && touchDevice ? '' : preset.baseUrl
}

/** `app` is whether this is the App Store app; only tests pass it. */
export function connectionOf(cfg: AiConfig = useAiConfig.getState(), app = isNativeApp): AiConnection | null {
  if (!cfg.provider) return null
  const slot = slotOf(cfg)
  const info = PROVIDERS[cfg.provider]
  if (cfg.provider !== 'other') {
    return {
      slot,
      provider: cfg.provider,
      kind: info.kind,
      name: info.label,
      company: info.company,
      baseUrl: info.baseUrl,
      model: (cfg.models[slot] ?? '').trim() || info.defaultModel,
      needsKey: true,
      local: false,
      privacyUrl: info.privacyUrl,
    }
  }
  const preset = presetById(cfg.preset)
  const custom = preset.id === 'custom'
  const baseUrl = presetBaseUrl(cfg, preset, app)
  const host = hostOf(baseUrl)
  const local = !!preset.local || isLocalUrl(baseUrl)
  return {
    slot,
    provider: 'other',
    kind: 'openai',
    name: custom ? host || 'your server' : preset.label,
    company: custom ? host || 'your server' : preset.label,
    baseUrl,
    model: (cfg.models[slot] ?? '').trim() || preset.defaultModel,
    // A custom server may not need a key (a self-hosted model); one is sent only if saved.
    needsKey: preset.needsKey && !custom,
    local,
    privacyUrl: preset.privacyUrl,
  }
}

export function isAiReady(cfg: AiConfig): boolean {
  const c = connectionOf(cfg)
  return !!c && !!c.baseUrl && !!c.model && (!c.needsKey || !!cfg.keys[c.slot])
}

/** True when a provider and its key (if it needs one) are set up on this device. */
export function useAiReady(): boolean {
  return useAiConfig(isAiReady)
}

// ------------------------------------------------------------------ keys

const secretName = (slot: string) => `ai.${slot}`

export function readKey(slot: string): Promise<string | null> {
  return getSecret(secretName(slot))
}

export async function saveKey(slot: string, key: string): Promise<void> {
  await setSecret(secretName(slot), key.trim())
  setAiConfig((s) => ({ keys: { ...s.keys, [slot]: true } }))
}

export async function deleteKey(slot: string): Promise<void> {
  await removeSecret(secretName(slot))
  setAiConfig((s) => {
    const keys = { ...s.keys }
    delete keys[slot]
    return { keys }
  })
}

/** Removes every saved AI key (Settings → Data → Reset this device). */
export async function clearAiSecrets(): Promise<void> {
  // Everything in the secret store, not just the slots this install knows of:
  // a custom server's key (`ai.other:custom:<host>`) whose flag is gone — after
  // a reinstall, or a switch to another address — can't be listed by name.
  await removeAllSecrets()
  // The known slots one by one as well, in case the Keychain plugin couldn't
  // clear the whole service (removeAllSecrets swallows that error).
  const slots = new Set([...Object.keys(useAiConfig.getState().keys), ...PROVIDER_ORDER, ...PRESETS.map((p) => `other:${p.id}`)])
  await Promise.all([...slots].map((s) => removeSecret(secretName(s)).catch(() => {})))
  setAiConfig({ keys: {} })
}

// The yes/no flags can drift from the real store (a Keychain restored on a new
// device, a reset browser), so check them once at startup.
async function refreshKeys() {
  const cfg = useAiConfig.getState()
  const slots = new Set(Object.keys(cfg.keys))
  const current = slotOf(cfg)
  if (current) slots.add(current)
  const found: Record<string, boolean> = {}
  await Promise.all(
    [...slots].map(async (slot) => {
      if (await getSecret(secretName(slot)).catch(() => null)) found[slot] = true
    }),
  )
  const before = useAiConfig.getState().keys
  const same = Object.keys(found).length === Object.keys(before).length && Object.keys(found).every((k) => before[k])
  if (!same) setAiConfig({ keys: found })
}
if (typeof window !== 'undefined') void refreshKeys()

// ------------------------------------------------------------- opening

export interface AiOpenOptions {
  /** A page to attach as context (vault path). */
  attachPath?: string
  /** Selected text to ask about. */
  selection?: string
  /** Text to prefill (or send, with send: true). */
  prompt?: string
  send?: boolean
}

export interface AiLaunch extends AiOpenOptions {
  seq: number
}

/** What the next visit to #/ai should start with; AiPage takes it once. */
export const useAiLaunch = create<{ launch: AiLaunch | null }>(() => ({ launch: null }))
let launchSeq = 0

/** Open the assistant (#/ai), optionally with a page or selection attached. */
export function openAi(opts: AiOpenOptions = {}): void {
  if (opts.attachPath || opts.selection || opts.prompt) useAiLaunch.setState({ launch: { ...opts, seq: ++launchSeq } })
  navigate({ name: 'ai' })
}

/** Open Settings on the AI tab. */
export function openAiSettings(): void {
  useUI.setState({ settings: true, settingsTab: 'ai' })
}

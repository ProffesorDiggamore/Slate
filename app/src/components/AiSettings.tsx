import { Check, ClipboardPaste, ExternalLink, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchModels, testConnection } from '../lib/ai/client'
import { revokeConsent } from '../lib/ai/consent'
import { CLAUDE_DEFAULT_MODEL, httpBaseUrl, isLocalUrl, PRESETS, presetById, PROVIDER_ORDER, PROVIDERS, type Preset, type PresetId } from '../lib/ai/providers'
import { connectionOf, defaultLocalUrl, deleteKey, hostOf, saveKey, setAiConfig, useAiConfig, type AiConnection } from '../lib/ai/store'
import type { ModelOption } from '../lib/ai/transport'
import * as native from '../lib/native'
import { toast } from '../lib/toasts'
import '../styles/ai.css'

// Settings → AI: pick a provider, paste your own key, choose a model, test it.
// Keys are handed straight to the device's secret store (the Keychain in the
// iPhone/iPad app); this screen never shows a saved key again.

// The AI hosts the website's privacy lock (netlify.toml) lets it reach.
const webHosts = native.WEB_ALLOWED_AI_HOSTS

// Exact Claude model IDs offered before the live list is loaded.
const CLAUDE_SUGGESTIONS = [CLAUDE_DEFAULT_MODEL, 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']

export function AiSettings() {
  const cfg = useAiConfig()
  const conn = useMemo(() => connectionOf(cfg), [cfg])
  return (
    <section className="ai-settings">
      <h3>AI assistant</h3>
      <p className="muted">
        Ask about your notes, rewrite text and draft pages with the AI you already use. Bring your own API key: Slate talks straight to that
        provider from this device and never sees your messages.
      </p>

      <div className="setting-sub">Provider</div>
      <div className="ai-provider-grid" role="radiogroup" aria-label="AI provider">
        {PROVIDER_ORDER.map((id, i) => {
          const p = PROVIDERS[id]
          const on = cfg.provider === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              className={'ai-provider' + (on ? ' is-active' : '')}
              style={{ '--i': i } as React.CSSProperties}
              onClick={() => setAiConfig({ provider: id })}
            >
              <span className="ai-provider-name">{p.label}</span>
              <span className="ai-provider-sub">{id === 'other' ? 'Groq, Ollama…' : p.company}</span>
              {on && (
                <span className="ai-provider-check" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {cfg.provider === 'other' && <OtherFields />}
      {conn && (
        <>
          <KeyField key={conn.slot} conn={conn} saved={!!cfg.keys[conn.slot]} />
          <ModelField key={`m:${conn.slot}`} conn={conn} hasKey={!!cfg.keys[conn.slot] || !conn.needsKey} />
          <TestRow key={`t:${conn.slot}`} conn={conn} />
        </>
      )}

      <ConsentList consent={cfg.consent} />

      <div className="settings-note ai-privacy">
        <ShieldCheck size={16} />
        <div>
          Keys stay on this device{native.isNativeApp ? ' in the iOS Keychain' : ''} and are never synced to GitHub or saved in your notes.
          Messages go straight to the provider you pick, only when you ask, and encrypted pages are never sent. The provider bills your account
          for what you use.
        </div>
      </div>
    </section>
  )
}

function OtherFields() {
  const cfg = useAiConfig()
  const preset = presetById(cfg.preset)
  const conn = connectionOf(cfg)
  const host = hostOf(conn?.baseUrl ?? '').replace(/:\d+$/, '')
  const blocked = !native.isNativeApp && !!host && !webHosts.includes(host)
  return (
    <>
      <label className="field">
        <span>Service</span>
        <select className="input" value={cfg.preset} onChange={(e) => setAiConfig({ preset: e.target.value as PresetId })}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {preset.id === 'custom' ? (
        <label className="field">
          <span>
            Base URL <span className="muted">(OpenAI-compatible, ending in /v1)</span>
          </span>
          <input
            className="input"
            value={cfg.customUrl}
            onChange={(e) => setAiConfig({ customUrl: e.target.value })}
            placeholder="https://example.com/v1"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {cfg.customUrl.trim() && !hostOf(cfg.customUrl) && (
            <span className="form-error">That doesn’t look like a web address. Type all of it, starting with https://</span>
          )}
        </label>
      ) : preset.local && native.isNativeApp ? (
        <LocalAddressField preset={preset} value={cfg.localUrls[preset.id] ?? defaultLocalUrl(preset)} />
      ) : (
        <p className="muted small ai-base-url">
          Sends to <code>{preset.baseUrl}</code>
        </p>
      )}
      {preset.local && <LocalHint preset={preset} />}
      {blocked && (
        <div className="settings-warn">
          <TriangleAlert size={16} />
          <div>
            The website can only reach the AI services it lists in its security policy, and {host} isn’t one of them, so requests will be blocked
            here. It works in the iPhone/iPad app, or pick one of the listed services.
          </div>
        </div>
      )}
    </>
  )
}

// Ollama / LM Studio in the App Store app: on an iPhone or iPad localhost is the
// device itself, so the model is reached at the computer's address on the
// Wi-Fi. (On a Mac running the app, localhost is that Mac and works as it is.)
function LocalAddressField({ preset, value }: { preset: Preset; value: string }) {
  const example = preset.baseUrl.replace('localhost', '192.168.1.20')
  const typed = value.trim()
  const error = !typed
    ? null
    : !httpBaseUrl(typed)
      ? `That doesn’t look like an address. Type all of it, like ${example}`
      : !isLocalUrl(typed)
        ? 'That isn’t an address on your network. For a server on the internet, choose Custom URL.'
        : null
  return (
    <label className="field">
      <span>
        Computer address <span className="muted">(where {preset.label} runs)</span>
      </span>
      <input
        className="input"
        value={value}
        onChange={(e) => setAiConfig((s) => ({ localUrls: { ...s.localUrls, [preset.id]: e.target.value } }))}
        placeholder={example}
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {error && <span className="form-error">{error}</span>}
      <span className="muted small">
        On iPhone or iPad, use the address of the computer running {preset.label} on the same Wi-Fi, like <code>{example}</code> — localhost
        would be this device.
      </span>
    </label>
  )
}

// How to let Slate in: the app (capacitor://localhost) talks over the network,
// the website from its own address, and both need the server to allow it.
function LocalHint({ preset }: { preset: Preset }) {
  if (preset.id === 'ollama') {
    return native.isNativeApp ? (
      <p className="muted small">
        Start Ollama with <code>OLLAMA_HOST=0.0.0.0</code> so other devices can reach it, and <code>OLLAMA_ORIGINS="capacitor://*"</code> so
        it accepts requests from the Slate app. (Ollama only accepts app addresses written with a <code>*</code>.)
      </p>
    ) : (
      <p className="muted small">
        Start Ollama with <code>OLLAMA_ORIGINS={location.origin}</code> so the browser is allowed to talk to it.
      </p>
    )
  }
  return native.isNativeApp ? (
    <p className="muted small">
      In LM Studio’s Developer tab, turn on “Enable CORS” and “Serve on Local Network”, start the server and load a model.
    </p>
  ) : (
    <p className="muted small">Start LM Studio’s local server with CORS turned on, and load a model.</p>
  )
}

function KeyField({ conn, saved }: { conn: AiConnection; saved: boolean }) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState(!saved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const info = conn.provider === 'other' ? presetById(useAiConfig.getState().preset) : PROVIDERS[conn.provider]
  const keyUrl = info.keyUrl
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText

  // Ollama and LM Studio never take a key. A custom server keeps the optional
  // key field even on the local network: some self-hosted servers want one.
  if (!conn.needsKey && conn.local && info.id !== 'custom')
    return <p className="muted small ai-no-key">{conn.name} runs on your computer and doesn’t need a key.</p>

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const key = value.trim().replace(/^Bearer\s+/i, '')
    if (!key) return setError('Paste your API key first.')
    if (/\s/.test(key) || key.length < 8) return setError('That doesn’t look like an API key — copy the whole key and try again.')
    setBusy(true)
    try {
      await saveKey(conn.slot, key)
      setValue('')
      setShow(false)
      setEditing(false)
      toast(`${conn.name} key saved on this device`)
    } catch {
      setError('Couldn’t save the key on this device.')
    } finally {
      setBusy(false)
    }
  }

  if (saved && !editing) {
    return (
      <div className="ai-key-saved">
        <KeyRound size={16} />
        <span>
          {conn.name} key saved on this device
          {!conn.needsKey && <span className="muted"> (optional)</span>}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
          Replace
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost text-error"
          onClick={() => {
            if (confirm(`Remove the ${conn.name} key from this device?`)) void deleteKey(conn.slot)
          }}
        >
          Remove key
        </button>
      </div>
    )
  }

  return (
    <form className="field ai-key-field" onSubmit={save}>
      <span>
        API key{!conn.needsKey && <span className="muted"> (only if your server needs one)</span>}
        {keyUrl && (
          <a className="ai-get-key" href={keyUrl} target="_blank" rel="noopener noreferrer">
            Get a key <ExternalLink size={12} />
          </a>
        )}
      </span>
      <div className="ai-key-row">
        <input
          className="input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={saved ? '•••••••• (saved — paste to replace)' : info.id === 'custom' ? 'API key' : PROVIDERS[conn.provider].keyPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={`${conn.name} API key`}
        />
        <button type="button" className="icon-btn" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {canPaste && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Paste"
            title="Paste"
            onClick={() =>
              void navigator.clipboard
                .readText()
                .then((t) => setValue(t.trim()))
                .catch(() => setError('Couldn’t read the clipboard — long-press the box and choose Paste.'))
            }
          >
            <ClipboardPaste size={16} />
          </button>
        )}
      </div>
      {error && (
        <div className="form-error">
          <TriangleAlert size={16} /> {error}
        </div>
      )}
      <div className="row-gap">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !value.trim()}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Save key
        </button>
        {saved && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function ModelField({ conn, hasKey }: { conn: AiConnection; hasKey: boolean }) {
  const chosen = useAiConfig((s) => s.models[conn.slot] ?? '')
  const [options, setOptions] = useState<ModelOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listId = `ai-models-${conn.slot.replace(/[^\w-]/g, '-')}`
  const suggestions: ModelOption[] = options ?? (conn.provider === 'anthropic' ? CLAUDE_SUGGESTIONS.map((id) => ({ id })) : [])
  const fallback = conn.provider === 'other' ? presetById(useAiConfig.getState().preset).defaultModel : PROVIDERS[conn.provider].defaultModel

  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      const list = await fetchModels()
      setOptions(list)
      if (!list.length) setError('No models came back — type the model’s ID instead.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the models.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field ai-model-field">
      <span>Model</span>
      <div className="ai-key-row">
        <input
          className="input"
          list={listId}
          value={chosen}
          onChange={(e) => setAiConfig((s) => ({ models: { ...s.models, [conn.slot]: e.target.value } }))}
          placeholder={fallback ? `${fallback} (default)` : 'Model ID, e.g. llama3.2'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Model"
        />
        <datalist id={listId}>
          {suggestions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label && m.label !== m.id ? m.label : undefined}
            </option>
          ))}
        </datalist>
        <button type="button" className="btn btn-sm" onClick={() => void load()} disabled={busy || !hasKey || !conn.baseUrl}>
          {busy ? <LoaderCircle size={15} className="spin" /> : null} Load models
        </button>
      </div>
      {options && options.length > 0 && <span className="muted small">{options.length} models available — tap the box to pick one.</span>}
      {!hasKey && <span className="muted small">Save a key to load the list of models.</span>}
      {error && (
        <div className="form-error">
          <TriangleAlert size={16} /> {error}
        </div>
      )}
    </div>
  )
}

function TestRow({ conn }: { conn: AiConnection }) {
  const ready = useAiConfig((s) => {
    const c = connectionOf(s)
    return !!c && !!c.model && !!c.baseUrl && (!c.needsKey || !!s.keys[c.slot])
  })
  const [state, setState] = useState<null | { busy: true } | { ok: boolean; text: string }>(null)
  useEffect(() => setState(null), [conn.model, conn.baseUrl])
  return (
    <div className="ai-test-row">
      <button
        type="button"
        className="btn btn-sm"
        disabled={!ready || (!!state && 'busy' in state)}
        onClick={async () => {
          setState({ busy: true })
          try {
            const reply = await testConnection()
            setState({ ok: true, text: `Working — ${conn.model} replied “${reply}”.` })
          } catch (err) {
            setState({ ok: false, text: err instanceof Error ? err.message : 'The test failed.' })
          }
        }}
      >
        {state && 'busy' in state ? <LoaderCircle size={15} className="spin" /> : null} Test
      </button>
      {state && 'ok' in state && (
        <span className={'ai-test-result' + (state.ok ? ' is-ok' : ' is-error')}>
          {state.ok ? <Check size={15} /> : <X size={15} />} {state.text}
        </span>
      )}
      {!ready && <span className="muted small">{conn.needsKey ? 'Save a key first.' : 'Enter the server address and model first.'}</span>}
    </div>
  )
}

function slotLabel(slot: string): string {
  if (slot in PROVIDERS) return PROVIDERS[slot as keyof typeof PROVIDERS].label
  if (slot.startsWith('other:custom:')) return slot.slice('other:custom:'.length)
  if (slot.startsWith('other:')) return presetById(slot.slice(6) as PresetId).label
  return slot
}

function ConsentList({ consent }: { consent: Record<string, boolean> }) {
  const allowed = Object.keys(consent).filter((k) => consent[k])
  return (
    <>
      <div className="setting-sub">Permission to send</div>
      <p className="muted small">Slate asks before it sends anything to a provider for the first time.</p>
      {allowed.length === 0 ? (
        <p className="muted small">You haven’t allowed any provider yet.</p>
      ) : (
        <ul className="ai-consent-list">
          {allowed.map((slot) => (
            <li key={slot}>
              <Check size={14} /> <span>{slotLabel(slot)}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => revokeConsent(slot)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

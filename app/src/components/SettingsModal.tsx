import { CalendarClock, Check, ChevronRight, CloudCog, Download, ExternalLink, Info, LayoutTemplate, LoaderCircle, Palette, RefreshCw, Smartphone, TriangleAlert, Database } from 'lucide-react'
import { useState } from 'react'
import { clearAll } from '../lib/db'
import { revokeGoogle } from '../lib/google/auth'
import { relativeTime, useIsMobile } from '../lib/hooks'
import { ACCENTS, setSettings, useSettings, type Density, type Font, type PageWidth, type Palette as PaletteName, type Theme } from '../lib/settings'
import { parseRepo } from '../lib/sync/github'
import { runSync, testConnection } from '../lib/sync/manager'
import { toast } from '../lib/toasts'
import { EMPTY_META } from '../lib/types'
import { applyFiles, setMeta, useVault } from '../lib/vault'
import { EncryptionSettings } from './EncryptionSettings'
import { GoogleCalendarSettings } from './GoogleCalendarSettings'
import { InstallSteps } from './InstallHint'
import { TemplateSettings } from './TemplateSettings'
import { Modal } from './ui'
import { useUI } from './uiState'

type Tab = 'sync' | 'appearance' | 'calendar' | 'templates' | 'install' | 'data' | 'about'

export function SettingsModal() {
  const open = useUI((s) => s.settings)
  const [tab, setTab] = useState<Tab>('sync')
  const mobile = useIsMobile()
  if (!open) return null
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'sync', label: 'Sync', icon: <CloudCog size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
    { id: 'calendar', label: 'Calendar & time', icon: <CalendarClock size={16} /> },
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={16} /> },
    { id: 'install', label: 'Install app', icon: <Smartphone size={16} /> },
    { id: 'data', label: 'Data', icon: <Database size={16} /> },
    { id: 'about', label: 'About', icon: <Info size={16} /> },
  ]
  return (
    <Modal title="Settings" onClose={() => useUI.setState({ settings: false })} wide className="settings">
      <div className="settings-body">
        <nav className={'settings-tabs' + (mobile ? ' is-row' : '')}>
          {tabs.map((t) => (
            <button key={t.id} type="button" className={'settings-tab' + (tab === t.id ? ' is-active' : '')} onClick={() => setTab(t.id)}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          {tab === 'sync' && <SyncSettings />}
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'calendar' && <CalendarSettings />}
          {tab === 'templates' && <TemplateSettings />}
          {tab === 'install' && (
            <section>
              <h3>Install Cairn as an app</h3>
              <p className="muted">
                Cairn is a web app you can install for free. Once installed it gets its own icon and window, opens instantly and works offline.
                Changes sync whenever you’re online.
              </p>
              <InstallSteps />
              <div className="settings-note">
                <strong>On your iPhone:</strong> open this same link in Safari and use <em>Share → Add to Home Screen</em>.
                <br />
                <strong>On your Mac:</strong> open it in Safari and use <em>File → Add to Dock…</em>
              </div>
              <div className="settings-note">
                <strong>Dock icon stuck on a white square?</strong> Safari bakes web-app icons onto a tile, which stands out in a dark, clear
                or tinted Dock. On macOS 26 or later, double-click <code>mac/apply-dock-icon.command</code> from{' '}
                <a href="https://github.com/ProffesorDiggamore/Cairn/tree/main/mac" target="_blank" rel="noopener noreferrer">
                  Cairn’s GitHub repo <ExternalLink size={12} />
                </a>{' '}
                to swap in a see-through icon that follows your Dock’s style. On older macOS, download the pebble below and choose it in the
                Cairn window under <em>Cairn → Settings → General</em> (click the icon).
                <div className="row-gap" style={{ marginTop: 8 }}>
                  <a className="btn btn-sm" href="/cairn-pebble.png" download="Cairn pebble.png">
                    <Download size={15} /> Download Dock icon
                  </a>
                </div>
              </div>
            </section>
          )}
          {tab === 'data' && <DataSettings />}
          {tab === 'about' && (
            <section>
              <h3>About Cairn</h3>
              <p>
                Cairn 2.0 — a Notion-style editor on top of plain Markdown files, Obsidian-compatible: <code>[[links]]</code>, backlinks,
                callouts, tasks and tags all work in both apps.
              </p>
              <p className="muted">
                Your notes live on this device and in your own GitHub repository. Nothing is sent anywhere else —{' '}
                <a href="/privacy.html" target="_blank" rel="noopener">
                  privacy details
                </a>
                . Keyboard: {` `}
                <kbd className="kbd">⌘K</kbd> search, <kbd className="kbd">⌘N</kbd> new page, <kbd className="kbd">/</kbd> blocks,{' '}
                <kbd className="kbd">[[</kbd> link a page, <kbd className="kbd">⌘\</kbd> sidebar.
              </p>
            </section>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function SyncForm({ onConnected }: { onConnected?: () => void }) {
  const current = useSettings((s) => s.sync)
  const [repo, setRepo] = useState(current ? `${current.owner}/${current.repo}` : '')
  const [branch, setBranch] = useState(current?.branch ?? '')
  const [folder, setFolder] = useState(current?.folder ?? '')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<{ text: string; danger: boolean } | null>(null)
  const [help, setHelp] = useState(!current)

  const connect = async (e: React.FormEvent, anyway = false) => {
    e.preventDefault()
    setError(null)
    setWarning(null)
    const parsed = parseRepo(repo)
    if (!parsed) return setError('Enter the repo as owner/name, like your-name/cairn-notes, or paste its GitHub URL.')
    const tok = token.trim() || current?.token || ''
    if (!tok) return setError('Paste your GitHub token.')
    setBusy(true)
    const probe = await testConnection({ ...parsed, branch: branch.trim() || 'main', token: tok })
    setBusy(false)
    if (!probe.ok) return setError(probe.error)
    const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, '')
    if (!anyway && probe.isPublic) {
      return setWarning({
        danger: true,
        text: `${parsed.owner}/${parsed.repo} is a PUBLIC repo — anyone on the internet could read your notes. Make it private on GitHub (repo Settings → General → Danger Zone → Change visibility), or use a different private repo.`,
      })
    }
    if (!anyway && probe.hasCode && !cleanFolder) {
      return setWarning({
        danger: false,
        text: `${parsed.owner}/${parsed.repo} holds app code, not just notes. Notes are safest in their own private repo (see “Where should my notes go?” below). If you want them here anyway, type a folder name like “notes” above so they stay out of the code.`,
      })
    }
    const cfg = { ...parsed, branch: branch.trim() || probe.defaultBranch, token: tok, ...(cleanFolder ? { folder: cleanFolder } : {}) }
    const changedRepo =
      !current || current.owner !== cfg.owner || current.repo !== cfg.repo || current.branch !== cfg.branch || (current.folder ?? '') !== cleanFolder
    if (changedRepo) {
      // A different repo: forget what we knew about the old one; local notes merge in.
      setMeta(EMPTY_META)
      const all = Object.values(useVault.getState().files)
      applyFiles(
        all.filter((f) => !f.deleted).map((f) => ({ ...f, baseSha: null, baseContent: null, dirty: true })),
        all.filter((f) => f.deleted).map((f) => f.path),
        { local: false },
      )
    }
    setSettings({ sync: cfg, onboarded: true })
    setToken('')
    toast(`Connected to ${cfg.owner}/${cfg.repo} — syncing…`)
    void runSync()
    onConnected?.()
  }

  return (
    <form className="sync-form" onSubmit={connect}>
      <label className="field">
        <span>GitHub repository</span>
        <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="your-name/cairn-notes" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label className="field">
        <span>
          Branch <span className="muted">(leave empty for the default)</span>
        </span>
        <input className="input" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label className="field">
        <span>
          Folder in the repo <span className="muted">(leave empty when the repo is only for notes)</span>
        </span>
        <input className="input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="notes" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label className="field">
        <span>Personal access token</span>
        <input
          className="input"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={current ? '•••••••• (saved — paste to replace)' : 'github_pat_…'}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button type="button" className="link-btn" onClick={() => setHelp(!help)}>
        <ChevronRight size={14} className={help ? 'rot90' : ''} /> Where should my notes go, and how do I get a token? (free, 2 minutes)
      </button>
      {help && (
        <ol className="help-steps">
          <li>
            <strong>Make a separate, private repo just for notes.</strong> Open{' '}
            <a href="https://github.com/new?name=cairn-notes&visibility=private" target="_blank" rel="noopener noreferrer">
              GitHub → New repository <ExternalLink size={12} />
            </a>
            , name it <strong>cairn-notes</strong>, choose <strong>Private</strong>, and click <strong>Create repository</strong>. Don’t use the
            repo that holds the Cairn app — keeping notes on their own means app updates and notes never mix, and nothing private ends up on
            the website.
          </li>
          <li>
            Open{' '}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
              GitHub → New fine-grained token <ExternalLink size={12} />
            </a>
            .
          </li>
          <li>
            Name it <strong>Cairn</strong> and pick an expiration (when it runs out, just paste a new one here).
          </li>
          <li>
            Under <strong>Repository access</strong> choose <strong>Only select repositories</strong> and pick <strong>cairn-notes</strong>.
          </li>
          <li>
            Under <strong>Permissions → Repository permissions</strong>, set <strong>Contents</strong> to <strong>Read and write</strong>.
          </li>
          <li>
            Click <strong>Generate token</strong>, copy it, and paste it above with <strong>your-name/cairn-notes</strong> as the repository.
            Do this once on each device.
          </li>
        </ol>
      )}
      {warning && (
        <div className={'settings-warn' + (warning.danger ? ' is-danger' : '')}>
          <TriangleAlert size={16} />
          <div>
            {warning.text}
            <div className="row-gap" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-sm" onClick={(e) => void connect(e, true)}>
                Connect anyway
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWarning(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="form-error">
          <TriangleAlert size={16} /> {error}
        </div>
      )}
      <div className="row-gap">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
          {current ? 'Save' : 'Connect'}
        </button>
      </div>
      <p className="muted small">The token is stored only on this device. It’s sent to GitHub and nowhere else, and it’s never saved into your notes.</p>
    </form>
  )
}

function SyncSettings() {
  const cfg = useSettings((s) => s.sync)
  const sync = useVault((s) => s.sync)
  const dirty = useVault((s) => Object.values(s.files).filter((f) => f.dirty).length)
  const [editing, setEditing] = useState(false)
  return (
    <section>
      <h3>Sync with GitHub</h3>
      <p className="muted">
        Cairn saves every note to this device instantly, then syncs it to your private GitHub repo automatically — so your Mac and phone always match.
        It’s free and the notes stay plain Markdown you own.
      </p>
      {cfg && !editing ? (
        <div className="sync-card">
          <div className="sync-card-row">
            <span className="muted">Repository</span>
            <a href={`https://github.com/${cfg.owner}/${cfg.repo}`} target="_blank" rel="noopener noreferrer">
              {cfg.owner}/{cfg.repo} <ExternalLink size={12} />
            </a>
          </div>
          <div className="sync-card-row">
            <span className="muted">Branch</span>
            <span>{cfg.branch}</span>
          </div>
          <div className="sync-card-row">
            <span className="muted">Notes folder</span>
            <span>{cfg.folder ? `${cfg.folder}/` : 'Whole repo'}</span>
          </div>
          <div className="sync-card-row">
            <span className="muted">Status</span>
            <span className={sync.status === 'error' ? 'text-error' : ''}>
              {sync.status === 'syncing'
                ? 'Syncing…'
                : sync.status === 'error'
                  ? sync.error
                  : sync.status === 'offline'
                    ? 'Offline — will sync when you reconnect'
                    : sync.lastSync
                      ? `Up to date · ${relativeTime(sync.lastSync)}`
                      : 'Waiting…'}
              {dirty > 0 && sync.status !== 'syncing' && ` · ${dirty} change${dirty === 1 ? '' : 's'} waiting`}
            </span>
          </div>
          <div className="row-gap">
            <button type="button" className="btn" onClick={() => void runSync()} disabled={sync.status === 'syncing'}>
              <RefreshCw size={15} className={sync.status === 'syncing' ? 'spin' : ''} /> Sync now
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Change repo or token
            </button>
            <button
              type="button"
              className="btn btn-ghost text-error"
              onClick={() => {
                if (!confirm('Stop syncing on this device? Your notes stay here and on GitHub.')) return
                setSettings({ sync: null })
                useVault.setState((s) => ({ sync: { ...s.sync, status: 'off', error: null } }))
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <SyncForm onConnected={() => setEditing(false)} />
      )}
      <p className="muted small" style={{ marginTop: 14 }}>
        <strong>Moving your notes to a new repo?</strong> Create the new private repo, press <em>Change repo or token</em> and enter it — Cairn
        copies every note on this device into it. The old copies stay in the old repo until you delete them there.
      </p>
    </section>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} type="button" className={v === value ? 'is-active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        {desc && <span className="toggle-desc">{desc}</span>}
      </span>
      <input type="checkbox" className="switch" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const PALETTES: { id: PaletteName; label: string; light: string[]; dark: string[] }[] = [
  { id: 'default', label: 'Default', light: ['#ffffff', '#f8f8f7', '#37352f'], dark: ['#191919', '#202020', '#e0e0e0'] },
  { id: 'paper', label: 'Paper', light: ['#fbf8f1', '#f3eee3', '#3b3428'], dark: ['#1f1b16', '#26211b', '#f5ead9'] },
  { id: 'slate', label: 'Slate', light: ['#f8fafc', '#eef2f7', '#253041'], dark: ['#151a21', '#1b212a', '#e3e9f1'] },
  { id: 'forest', label: 'Forest', light: ['#f7faf6', '#ecf3ec', '#24352a'], dark: ['#131b16', '#19231d', '#e2ede5'] },
  { id: 'rose', label: 'Rosé', light: ['#fdf8f8', '#f8edef', '#3d2a30'], dark: ['#1c1518', '#241b1f', '#f3e6ea'] },
  { id: 'oled', label: 'Pure black', light: ['#ffffff', '#f8f8f7', '#37352f'], dark: ['#000000', '#080808', '#e0e0e0'] },
]

function AppearanceSettings() {
  const s = useSettings()
  const dark = document.documentElement.dataset.theme === 'dark'
  const custom = !ACCENTS.some((a) => a.color.toLowerCase() === s.accent.toLowerCase())
  return (
    <section>
      <h3>Appearance</h3>
      <div className="setting-row">
        <span>Theme</span>
        <Segmented<Theme> value={s.theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(theme) => setSettings({ theme })} />
      </div>

      <div className="setting-sub">Colours</div>
      <div className="palette-row">
        {PALETTES.map((p) => {
          const c = dark ? p.dark : p.light
          return (
            <button key={p.id} type="button" className={'palette-option' + (s.palette === p.id ? ' is-active' : '')} onClick={() => setSettings({ palette: p.id })}>
              <span className="palette-swatch">
                <span style={{ background: c[1] }} />
                <span style={{ background: c[0], flex: 2 }} />
                <span style={{ background: s.accent, flex: 0.35 }} />
              </span>
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="setting-row" style={{ marginTop: 12 }}>
        <span>Accent</span>
        <div className="accent-row">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.label}
              aria-label={a.label}
              className={'accent-dot' + (s.accent.toLowerCase() === a.color ? ' is-active' : '')}
              style={{ background: a.color }}
              onClick={() => setSettings({ accent: a.color })}
            />
          ))}
          <label className={'accent-dot ic-custom' + (custom ? ' is-active' : '')} title="Any colour" style={custom ? { background: s.accent } : undefined}>
            <input type="color" value={s.accent} onChange={(e) => setSettings({ accent: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="setting-sub">Text</div>
      <div className="setting-row">
        <span>Font</span>
        <div className="font-picker">
          {(
            [
              ['sans', 'Default'],
              ['serif', 'Serif'],
              ['mono', 'Mono'],
              ['rounded', 'Rounded'],
            ] as [Font, string][]
          ).map(([f, label]) => (
            <button key={f} type="button" className={'font-option font-' + f + (s.font === f ? ' is-active' : '')} onClick={() => setSettings({ font: f })}>
              <span className="font-sample">Ag</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <span>Text size</span>
        <div className="range-row">
          <input type="range" min={13} max={22} step={1} value={s.fontSize} onChange={(e) => setSettings({ fontSize: Number(e.target.value) })} />
          <span className="muted">{s.fontSize}px</span>
        </div>
      </div>
      <div className="setting-row">
        <span>Spacing</span>
        <Segmented<Density> value={s.density} options={[['compact', 'Compact'], ['normal', 'Normal'], ['airy', 'Airy']]} onChange={(density) => setSettings({ density })} />
      </div>
      <div className="setting-row">
        <span>Page width</span>
        <Segmented<PageWidth>
          value={s.pageWidth}
          options={[['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide'], ['full', 'Full']]}
          onChange={(pageWidth) => setSettings({ pageWidth, fullWidth: pageWidth === 'full' })}
        />
      </div>

      <div className="setting-sub">Editing</div>
      <div className="setting-row">
        <span>Toggle-heading arrows</span>
        <Segmented<'hover' | 'always'> value={s.foldArrows} options={[['hover', 'On hover'], ['always', 'Always']]} onChange={(foldArrows) => setSettings({ foldArrows })} />
      </div>
      <Toggle label="Spell check" value={s.spellcheck} onChange={(spellcheck) => setSettings({ spellcheck })} />
    </section>
  )
}

function CalendarSettings() {
  const s = useSettings()
  return (
    <section>
      <h3>Calendar &amp; time</h3>
      <p className="muted">
        The Calendar button shows your daily notes by month. Connect Google Calendar to see your events there too and add new ones without
        leaving Cairn — or skip it and use Google’s event page or an .ics file for Apple Calendar.
      </p>
      <GoogleCalendarSettings />
      <Toggle
        label="Little clocks next to times"
        desc="Shows a tiny clock after times like “2:30pm” or “1-3”. Click it to add the line to your calendar."
        value={s.timeClocks}
        onChange={(timeClocks) => setSettings({ timeClocks })}
      />
      <Toggle
        label="Treat plain ranges like “1-3” as times"
        desc="Guesses 7–11 as morning and 12–6 as afternoon. Turn off if page numbers or scores get clocks."
        value={s.bareTimeRanges}
        onChange={(bareTimeRanges) => setSettings({ bareTimeRanges })}
      />
      <Toggle label="24-hour time" value={s.clock24} onChange={(clock24) => setSettings({ clock24 })} />
      <Toggle label="Week starts on Monday" value={s.weekStartsMonday} onChange={(weekStartsMonday) => setSettings({ weekStartsMonday })} />
      <div className="setting-row">
        <span>Add events to</span>
        <Segmented<'google' | 'ics'> value={s.calendarApp} options={[['google', 'Google Calendar'], ['ics', 'Apple Calendar']]} onChange={(calendarApp) => setSettings({ calendarApp })} />
      </div>
      <label className="field">
        <span>Daily notes folder</span>
        <input className="input" value={s.dailyFolder} onChange={(e) => setSettings({ dailyFolder: e.target.value })} placeholder="Daily" />
      </label>
    </section>
  )
}

function DataSettings() {
  const count = useVault((s) => s.paths.length)
  return (
    <section>
      <h3>Your data</h3>
      <p className="muted">
        {count} page{count === 1 ? '' : 's'} on this device. Every page is a Markdown file — in your GitHub repo you can open them with Obsidian, VS Code
        or any text editor.
      </p>
      <EncryptionSettings />
      <div className="danger-zone">
        <div>
          <strong>Reset this device</strong>
          <p className="muted small">Removes all notes, settings and tokens from this device only, and cancels Cairn’s Google Calendar access. Anything already synced stays on GitHub.</p>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            const dirty = Object.values(useVault.getState().files).some((f) => f.dirty)
            const msg = dirty
              ? 'Some changes haven’t synced yet and will be LOST. Reset this device anyway?'
              : 'Remove all Cairn data from this device? Your GitHub copy is not touched.'
            if (!confirm(msg)) return
            await revokeGoogle()
            await clearAll()
            try {
              localStorage.clear()
            } catch {
              /* ignore */
            }
            location.hash = ''
            location.reload()
          }}
        >
          Reset
        </button>
      </div>
    </section>
  )
}

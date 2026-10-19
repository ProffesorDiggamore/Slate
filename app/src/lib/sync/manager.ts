import { useSettings } from '../settings'
import { toast } from '../toasts'
import type { SyncConfig } from '../types'
import { applyFiles, setChangeListener, setMeta, useVault } from '../vault'
import { folderPrefix, syncOnce, type VaultAdapter } from './engine'
import { GitHubApi, GitHubError } from './github'
import { titleOf } from '../paths'
import { flushAll } from '../flush'

const adapter: VaultAdapter = {
  files: () => useVault.getState().files,
  apply: (put, remove) => applyFiles(put, remove, { local: false }),
  meta: () => useVault.getState().meta,
  setMeta,
}

let timer: ReturnType<typeof setTimeout> | null = null
let running: Promise<void> | null = null
let again = false
let failures = 0

function setStatus(patch: Partial<ReturnType<typeof useVault.getState>['sync']>) {
  useVault.setState((s) => ({ sync: { ...s.sync, ...patch } }))
}

export function syncConfigured(): SyncConfig | null {
  const c = useSettings.getState().sync
  return c && c.token && c.owner && c.repo ? c : null
}

// Ask for a sync after `delay` ms; repeated calls push the timer back.
export function requestSync(delay = 0) {
  if (!syncConfigured()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void runSync()
  }, delay)
}

export async function runSync(): Promise<void> {
  const cfg = syncConfigured()
  if (!cfg) {
    setStatus({ status: 'off', error: null })
    return
  }
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      flushAll()
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus({ status: 'offline', error: null })
        break
      }
      setStatus({ status: 'syncing', error: null })
      try {
        const res = await syncOnce(new GitHubApi(cfg), adapter, Date.now, folderPrefix(cfg.folder))
        failures = 0
        setStatus({ status: 'idle', lastSync: Date.now(), error: null })
        for (const c of res.conflicts) {
          toast(`Edited on two devices at once — saved your copy as “${titleOf(c)}”.`, { duration: 10000 })
        }
      } catch (e) {
        failures++
        const offline = e instanceof GitHubError && e.status === 0
        setStatus({ status: offline ? 'offline' : 'error', error: e instanceof Error ? e.message : String(e) })
        // Back off: 15s, 30s, 60s … up to 5 minutes.
        requestSync(Math.min(300_000, 15_000 * 2 ** (failures - 1)))
        break
      }
    } while (again)
  })()
  try {
    await running
  } finally {
    running = null
  }
}

// Local edits schedule a sync a moment after typing stops.
setChangeListener(() => requestSync(2500))

export function startAutoSync(): () => void {
  if (!syncConfigured()) setStatus({ status: 'off' })
  const kick = () => requestSync(0)
  const onVisible = () => {
    // Sync right away when leaving (iOS may freeze us soon) and when returning.
    if (document.visibilityState === 'hidden') {
      flushAll()
      void runSync()
    } else requestSync(0)
  }
  window.addEventListener('online', kick)
  window.addEventListener('focus', kick)
  document.addEventListener('visibilitychange', onVisible)
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') requestSync(0)
  }, 30_000)
  requestSync(0)
  return () => {
    window.removeEventListener('online', kick)
    window.removeEventListener('focus', kick)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(interval)
  }
}

export interface RepoCheck {
  ok: true
  defaultBranch: string
  isPublic: boolean
  /** The repo also holds app code (Slate's own app/ folder, a package.json…). */
  hasCode: boolean
}

export async function testConnection(cfg: SyncConfig): Promise<RepoCheck | { ok: false; error: string }> {
  try {
    const api = new GitHubApi(cfg)
    const repo = await api.getRepo()
    if (repo.permissions && repo.permissions.push === false) {
      return { ok: false, error: "The token can read this repo but can't write to it. Give it Contents: Read and write." }
    }
    let hasCode = false
    try {
      hasCode = await api.looksLikeCode()
    } catch {
      /* empty repo or no access to the listing — not a blocker */
    }
    return { ok: true, defaultBranch: repo.default_branch, isPublic: !repo.private, hasCode }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

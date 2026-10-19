import { History, LoaderCircle, Lock, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { isEncrypted, useLock } from '../lib/crypto'
import { diffStats, foldContext, lineDiff } from '../lib/diff'
import { relativeTime } from '../lib/hooks'
import { titleOf } from '../lib/paths'
import { useSettings } from '../lib/settings'
import { folderPrefix } from '../lib/sync/engine'
import { GitHubApi, type CommitInfo } from '../lib/sync/github'
import { toast } from '../lib/toasts'
import { updateContent, useVault } from '../lib/vault'
import { Modal } from './ui'
import { useUI } from './uiState'

// Version history: every synced version of a page is a commit in your GitHub
// repo, so Slate can list them, show what changed since, and bring one back.
// Restoring is an ordinary edit, so the version you replace stays in history too.

const close = () => useUI.setState({ history: null })

export function HistoryModal() {
  const path = useUI((s) => s.history)
  if (!path) return null
  return <HistoryBody key={path} path={path} />
}

/** Text to show for a stored version: decrypted when it's sealed and we're unlocked. */
function useReadable(raw: string | null | undefined): string | null | undefined {
  const ring = useLock((s) => s.keyring)
  const [out, setOut] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (raw === undefined || raw === null || !isEncrypted(raw)) return setOut(raw)
    if (!ring) return setOut(null)
    let alive = true
    ring.open(raw).then(
      (t) => alive && setOut(t),
      () => alive && setOut(null),
    )
    return () => {
      alive = false
    }
  }, [raw, ring])
  return out
}

function HistoryBody({ path }: { path: string }) {
  const cfg = useSettings((s) => s.sync)
  const current = useVault((s) => s.files[path]?.content ?? '')
  const [commits, setCommits] = useState<CommitInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, string | null>>({})
  const [full, setFull] = useState(false)

  const api = useMemo(() => (cfg?.token ? new GitHubApi(cfg) : null), [cfg])
  const repoPath = folderPrefix(cfg?.folder) + path

  useEffect(() => {
    if (!api) return
    let alive = true
    api.listCommits(repoPath).then(
      (list) => {
        if (!alive) return
        setCommits(list)
        if (list[0]) setSel(list[0].sha)
      },
      (e: Error) => alive && setError(e.message),
    )
    return () => {
      alive = false
    }
  }, [api, repoPath])

  useEffect(() => {
    if (!api || !sel || sel in versions) return
    let alive = true
    api.fileAt(repoPath, sel).then(
      (text) => alive && setVersions((v) => ({ ...v, [sel]: text })),
      (e: Error) => alive && setError(e.message),
    )
    return () => {
      alive = false
    }
  }, [api, sel, repoPath, versions])

  const raw = sel ? versions[sel] : undefined
  const then = useReadable(raw)
  const now = useReadable(current)
  const diff = useMemo(() => (typeof then === 'string' && typeof now === 'string' ? lineDiff(then, now) : null), [then, now])
  const rows = useMemo(() => (diff ? (full ? diff : foldContext(diff, 2)) : []), [diff, full])
  const stats = diff ? diffStats(diff) : null

  const restore = () => {
    if (typeof raw !== 'string') return
    if (!confirm('Replace this page with the selected version? What’s there now stays in the history.')) return
    updateContent(path, raw)
    toast('Version restored — it syncs like any other edit.')
    close()
  }

  let body: React.ReactNode
  if (!cfg) body = <p className="muted">Version history comes from your GitHub repo. Turn on sync in Settings to start keeping versions.</p>
  else if (error) body = <div className="form-error">{error}</div>
  else if (!commits)
    body = (
      <p className="muted">
        <LoaderCircle size={14} className="spin" /> Loading versions…
      </p>
    )
  else if (!commits.length) body = <p className="muted">No synced versions yet. Each sync saves one.</p>
  else
    body = (
      <div className="history">
        <ol className="history-list">
          {commits.map((c, i) => (
            <li key={c.sha}>
              <button type="button" className={'history-item' + (sel === c.sha ? ' is-active' : '')} onClick={() => setSel(c.sha)}>
                <span className="history-when">{i === 0 ? 'Last synced' : relativeTime(c.date)}</span>
                <span className="history-date">{new Date(c.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <span className="history-msg">{c.message}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="history-view">
          {raw === undefined ? (
            <p className="muted">
              <LoaderCircle size={14} className="spin" /> Loading…
            </p>
          ) : raw === null ? (
            <p className="muted">The page was deleted or renamed in this version.</p>
          ) : then === null || now === null ? (
            <p className="muted">
              <Lock size={14} /> This version is encrypted. Unlock your encrypted pages to compare it.
            </p>
          ) : (
            <>
              <div className="history-head">
                <span className="muted small">
                  {stats && stats.added + stats.removed === 0
                    ? 'Same as now.'
                    : `Since then: ${stats?.added} line${stats?.added === 1 ? '' : 's'} added, ${stats?.removed} removed.`}
                </span>
                <label className="small muted">
                  <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} /> Whole page
                </label>
              </div>
              <pre className="history-diff">
                {rows.map((r, i) =>
                  r.kind === 'gap' ? (
                    <div key={i} className="diff-gap">
                      ⋯ {r.count} unchanged line{r.count === 1 ? '' : 's'}
                    </div>
                  ) : (
                    <div key={i} className={'diff-' + r.kind}>
                      <span className="diff-sign">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</span>
                      {r.text || ' '}
                    </div>
                  ),
                )}
              </pre>
              <p className="muted small">
                <span className="diff-legend diff-del">−</span> only in this version <span className="diff-legend diff-add">+</span> added since
              </p>
            </>
          )}
          <div className="row-gap">
            <button type="button" className="btn btn-primary" onClick={restore} disabled={typeof raw !== 'string' || (stats?.added === 0 && stats?.removed === 0)}>
              <RotateCcw size={15} /> Restore this version
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <Modal title={`Version history · ${titleOf(path)}`} onClose={close} wide className="history-modal">
      <div className="history-body">
        {body}
        <p className="muted small history-note">
          <History size={13} /> Only synced versions are listed, and history starts from the page’s current name.
        </p>
      </div>
    </Modal>
  )
}

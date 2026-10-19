import { Check, LoaderCircle, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { googleConfigured, useGoogleAuth } from '../lib/google/auth'
import { connectGoogleCalendar, disconnectGoogleCalendar, loadCalendars, refreshGoogle, useGoogleCal } from '../lib/google/store'
import { setSettings, useSettings } from '../lib/settings'

// Settings → Calendar & time → Google Calendar: connect, pick calendars, disconnect.

export function GoogleCalendarSettings() {
  const g = useSettings((s) => s.google)
  const hasToken = useGoogleAuth((s) => !!s.token && s.expiresAt > Date.now() + 30_000)
  const busy = useGoogleAuth((s) => s.busy)
  const authError = useGoogleAuth((s) => s.error)
  const calendars = useGoogleCal((s) => s.calendars)
  const calError = useGoogleCal((s) => s.error)

  useEffect(() => {
    if (g && hasToken && !calendars) void loadCalendars()
  }, [g, hasToken, calendars])

  if (!googleConfigured()) {
    return (
      <div className="settings-note">
        <strong>Google Calendar</strong> isn’t switched on for this copy of Slate. Whoever hosts it needs to add a Google client ID — the
        steps are in the README.
      </div>
    )
  }

  const privacy = (
    <p className="muted small google-privacy">
      <ShieldCheck size={14} /> Your calendar goes straight from Google to this device — never to a Slate server — and is only kept while Slate
      is open.{' '}
      <a href="/privacy.html" target="_blank" rel="noopener">
        Privacy
      </a>
    </p>
  )

  if (!g) {
    return (
      <div className="google-card">
        <div className="google-card-title">Google Calendar</div>
        <p className="muted">See your events next to your daily notes and add new ones without leaving Slate.</p>
        <div className="row-gap">
          <button type="button" className="btn btn-primary" onClick={connectGoogleCalendar} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <GoogleMark />} Connect Google Calendar
          </button>
        </div>
        {authError && <ErrorLine text={authError} />}
        {privacy}
      </div>
    )
  }

  const writable = (calendars ?? []).filter((c) => c.writable)
  const toggle = (id: string, show: boolean) =>
    setSettings((s) => (s.google ? { google: { ...s.google, hidden: show ? s.google.hidden.filter((h) => h !== id) : [...s.google.hidden, id] } } : {}))

  return (
    <div className="google-card">
      <div className="google-card-title">
        Google Calendar <span className="google-connected">
          <Check size={13} /> Connected{g.email ? ` as ${g.email}` : ''}
        </span>
      </div>
      {!hasToken ? (
        <div className="row-gap">
          <button type="button" className="btn btn-sm" onClick={refreshGoogle} disabled={busy}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Load my calendars
          </button>
          <span className="muted small">Google signs Slate out every hour; this signs back in.</span>
        </div>
      ) : !calendars ? (
        <p className="muted small">
          <LoaderCircle size={13} className="spin" /> Loading your calendars…
        </p>
      ) : (
        <>
          <div className="setting-sub">Show in Slate</div>
          <ul className="google-cals">
            {calendars.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" checked={!g.hidden.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
                  <span className="google-swatch" style={{ background: c.color }} />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
          {writable.length > 0 && (
            <div className="setting-row">
              <span>Add new events to</span>
              <select
                value={g.target ?? writable.find((c) => c.primary)?.id ?? writable[0].id}
                onChange={(e) => setSettings((s) => (s.google ? { google: { ...s.google, target: e.target.value } } : {}))}
              >
                {writable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      {(authError || calError) && <ErrorLine text={(authError || calError)!} />}
      <div className="row-gap" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-ghost text-error"
          onClick={() => {
            if (confirm('Disconnect Google Calendar on this device? Slate’s access is cancelled too; your calendar itself isn’t touched.'))
              void disconnectGoogleCalendar()
          }}
        >
          Disconnect
        </button>
      </div>
      {privacy}
    </div>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div className="form-error">
      <TriangleAlert size={16} /> {text}
    </div>
  )
}

// Google's "G", flat, so it reads as "this signs in with Google".
function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.25 1.45-1.65 4.25-5.35 4.25-3.2 0-5.85-2.65-5.85-5.95S8.8 6.35 12 6.35c1.85 0 3.1.8 3.8 1.45l2.6-2.5C16.75 3.75 14.6 2.8 12 2.8 6.95 2.8 2.85 6.9 2.85 12s4.1 9.2 9.15 9.2c5.3 0 8.8-3.7 8.8-8.95 0-.6-.05-1.05-.15-1.5z" />
    </svg>
  )
}

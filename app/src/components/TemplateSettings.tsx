import { FileText, LayoutTemplate } from 'lucide-react'
import { titleOf } from '../lib/paths'
import { setSettings, useSettings } from '../lib/settings'
import { templatePaths } from '../lib/templates'
import { toast } from '../lib/toasts'
import { addStarterTemplates, useVault } from '../lib/vault'
import { openNote } from '../lib/router'
import { useUI } from './uiState'

// Settings → Templates.

export function TemplateSettings() {
  const s = useSettings()
  const paths = useVault((v) => v.paths)
  const list = templatePaths(paths, s.templatesFolder)
  const names = list.map((p) => titleOf(p))
  const select = (value: string, onChange: (v: string) => void, none: string) => (
    <select value={names.some((n) => n.toLowerCase() === value.toLowerCase()) ? names.find((n) => n.toLowerCase() === value.toLowerCase()) : ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none}</option>
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
  return (
    <section>
      <h3>Templates</h3>
      <p className="muted">
        A template is any page in your templates folder. Use <code>{'{{date}}'}</code>, <code>{'{{time}}'}</code>, <code>{'{{title}}'}</code>,{' '}
        <code>{'{{weekday}}'}</code> or <code>{'{{date:dddd, MMMM D}}'}</code> and they’re filled in. Insert one with <kbd className="kbd">/</kbd>{' '}
        <em>Template</em>, or make a new page from one in the command menu or a folder’s menu.
      </p>
      <label className="field">
        <span>Templates folder</span>
        <input className="input" value={s.templatesFolder} onChange={(e) => setSettings({ templatesFolder: e.target.value })} placeholder="Templates" />
      </label>
      <div className="setting-row">
        <span>New daily notes start from</span>
        {select(s.dailyTemplate, (dailyTemplate) => setSettings({ dailyTemplate }), 'A blank page')}
      </div>
      <div className="setting-row">
        <span>Meeting notes start from</span>
        {select(s.meetingTemplate, (meetingTemplate) => setSettings({ meetingTemplate: meetingTemplate || 'Meeting' }), 'Built-in meeting layout')}
      </div>
      <label className="field">
        <span>Meeting notes folder</span>
        <input className="input" value={s.meetingFolder} onChange={(e) => setSettings({ meetingFolder: e.target.value })} placeholder="Meetings" />
      </label>
      {list.length > 0 ? (
        <ul className="template-list">
          {list.map((p) => (
            <li key={p}>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  useUI.setState({ settings: false })
                  openNote(p)
                }}
              >
                <FileText size={14} /> {titleOf(p)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No templates yet.</p>
      )}
      <div className="row-gap">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const n = addStarterTemplates()
            toast(n ? `Added ${n} starter template${n === 1 ? '' : 's'}.` : 'The starter templates are already there.')
          }}
        >
          <LayoutTemplate size={15} /> Add starter templates
        </button>
      </div>
    </section>
  )
}

import { ArrowRight, CloudCog, Laptop } from 'lucide-react'
import { useState } from 'react'
import { openNote } from '../lib/router'
import { setSettings } from '../lib/settings'
import { createNote } from '../lib/vault'
import { SyncForm } from './SettingsModal'
import { Logo } from './ui'

const GETTING_STARTED = `---
icon: "👋"
---

Slate is a calm place for your notes. Every page is a plain Markdown file, so it also opens in Obsidian or any text editor.

## The basics

- Type \`/\` on an empty line for headings, to-dos, callouts, tables and more
- Type \`[[\` to link another page — links show up as backlinks at the bottom of that page
- Select text to bold it, highlight it, or turn it into a link
- Press \`⌘K\` (\`Ctrl+K\` on Windows) to search everything, \`⌘N\` (\`Ctrl+N\`) for a new page

## Try it

- [ ] Give this page a different icon (click the 👋)
- [ ] Make a page called [[My first page]] by clicking that link
- [ ] Open the Graph to see how pages connect

> [!tip] Sync your devices
> Open **Settings → Sync** to connect a free private GitHub repo. Then install Slate on your phone and computer from **Settings → Install app**.
`

export function Onboarding() {
  const [mode, setMode] = useState<'choose' | 'github'>('choose')
  const local = () => {
    setSettings({ onboarded: true })
    openNote(createNote({ title: 'Getting started', content: GETTING_STARTED }))
  }
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <Logo size={56} />
        <h1>Welcome to Slate</h1>
        <p className="muted">Notes that feel like Notion, files you own like Obsidian — on your computer and your phone, free.</p>
        {mode === 'choose' ? (
          <div className="onboarding-options">
            <button type="button" className="option" onClick={() => setMode('github')}>
              <CloudCog size={22} />
              <span>
                <strong>Connect my GitHub notes</strong>
                <span className="muted">Recommended. Syncs across devices and brings in notes you already have.</span>
              </span>
              <ArrowRight size={18} />
            </button>
            <button type="button" className="option" onClick={local}>
              <Laptop size={22} />
              <span>
                <strong>Start on this device</strong>
                <span className="muted">You can turn on sync any time in Settings.</span>
              </span>
              <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <div className="onboarding-form">
            <SyncForm />
            <button type="button" className="link-btn" onClick={() => setMode('choose')}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

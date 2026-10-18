import type { Editor } from '@tiptap/core'
import { FileText, LayoutTemplate, Settings } from 'lucide-react'
import { dateFromTitle } from '../lib/calendar'
import { markdownToDoc } from '../lib/markdown/parse'
import { splitFrontmatter } from '../lib/markdown/frontmatter'
import { titleOf } from '../lib/paths'
import { openNote, parseHash } from '../lib/router'
import { useSettings } from '../lib/settings'
import { baseVars, renderTemplate, templatePaths } from '../lib/templates'
import { toast } from '../lib/toasts'
import { addStarterTemplates, createNote, useVault } from '../lib/vault'
import { openMenu, type MenuEntry } from './ui'
import { useUI } from './uiState'

// Picking a template: make a new page from it, or drop it into the page you're on.

function templates(): string[] {
  return templatePaths(useVault.getState().paths, useSettings.getState().templatesFolder)
}

function emptyEntries(): MenuEntry[] {
  return [
    {
      label: 'Add starter templates (Daily, Meeting)',
      icon: <LayoutTemplate size={15} />,
      onSelect: () => {
        const n = addStarterTemplates()
        toast(n ? `Added ${n} template${n === 1 ? '' : 's'} to “${useSettings.getState().templatesFolder}”.` : 'They’re already there.')
      },
    },
    { label: 'Template settings…', icon: <Settings size={15} />, onSelect: () => useUI.setState({ settings: true }) },
  ]
}

function pick(at: { x: number; y: number } | HTMLElement, run: (path: string) => void, title: string) {
  const list = templates()
  openMenu(
    at,
    list.length ? list.map((p) => ({ label: titleOf(p), icon: <FileText size={15} />, onSelect: () => run(p) })) : emptyEntries(),
    list.length ? title : `No templates in “${useSettings.getState().templatesFolder}” yet`,
  )
}

export function newPageFromTemplate(templatePath: string, folder = ''): string {
  const text = useVault.getState().files[templatePath]?.content ?? ''
  const title = titleOf(templatePath)
  const now = new Date()
  const path = createNote({ folder, title, content: renderTemplate(text, baseVars(now, title, now), now) })
  openNote(path)
  return path
}

export function chooseNewFromTemplate(at: { x: number; y: number } | HTMLElement, folder = '') {
  pick(at, (p) => newPageFromTemplate(p, folder), 'New page from template')
}

/** Inserts a template's text (not its properties) at the cursor. */
export function insertTemplate(editor: Editor, templatePath: string) {
  const route = parseHash(location.hash)
  const title = route.name === 'note' ? titleOf(route.path) : ''
  const now = new Date()
  const day = dateFromTitle(title) ?? now
  const body = splitFrontmatter(useVault.getState().files[templatePath]?.content ?? '').body
  const md = renderTemplate(body, baseVars(day, title, now), day).trim()
  if (!md) return
  editor.chain().focus().insertContent(markdownToDoc(md).content ?? []).run()
}

export function chooseTemplateToInsert(editor: Editor) {
  const c = editor.view.coordsAtPos(editor.state.selection.from)
  pick({ x: c.left, y: c.bottom + 4 }, (p) => insertTemplate(editor, p), 'Insert template')
}

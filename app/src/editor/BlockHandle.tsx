import type { Editor } from '@tiptap/core'
import DragHandle from '@tiptap/extension-drag-handle-react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Copy, GripVertical, Plus, Trash } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TurnIntoMenu } from './Toolbars'

// Notion's hover handle: "+" adds a block below, the grip drags or opens a menu.
export function BlockHandle({ editor }: { editor: Editor }) {
  const target = useRef<{ node: PMNode | null; pos: number }>({ node: null, pos: -1 })
  const [menu, setMenu] = useState<null | 'main' | 'turn'>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  useEffect(() => {
    // Freeze the handle while its menu is open.
    editor.commands.setMeta('lockDragHandle', !!menu)
  }, [menu, editor])

  const addBelow = () => {
    const { node, pos } = target.current
    if (!node || pos < 0) return
    const after = pos + node.nodeSize
    const isEmptyPara = node.type.name === 'paragraph' && node.content.size === 0
    if (isEmptyPara) {
      editor.chain().focus().setTextSelection(pos + 1).insertContent('/').run()
    } else {
      editor
        .chain()
        .focus()
        .insertContentAt(after, { type: 'paragraph' })
        .command(({ tr }) => {
          tr.setSelection(TextSelection.create(tr.doc, after + 1))
          return true
        })
        .insertContent('/')
        .run()
    }
  }

  const selectBlock = () => {
    const { pos } = target.current
    if (pos < 0) return false
    editor.chain().focus().command(({ tr }) => {
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      return true
    }).run()
    return true
  }

  return (
    <DragHandle
      editor={editor}
      className="block-handle"
      onNodeChange={({ node, pos }) => {
        target.current = { node, pos }
      }}
    >
      <div className="block-handle-inner" ref={wrap}>
        <button type="button" className="bh-btn" aria-label="Add block below" title="Add block below" onClick={addBelow}>
          <Plus size={18} />
        </button>
        <button
          type="button"
          className="bh-btn bh-grip"
          aria-label="Drag to move, click for options"
          title="Drag to move · Click for options"
          onClick={() => {
            if (selectBlock()) setMenu(menu ? null : 'main')
          }}
        >
          <GripVertical size={18} />
        </button>
        {menu === 'main' && (
          <div className="popover block-menu">
            <button type="button" className="menu-item" onClick={() => setMenu('turn')}>
              Turn into…
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                const { node, pos } = target.current
                if (node) editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run()
                setMenu(null)
              }}
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              type="button"
              className="menu-item is-danger"
              onClick={() => {
                const { node, pos } = target.current
                if (node) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
                setMenu(null)
              }}
            >
              <Trash size={14} /> Delete
            </button>
          </div>
        )}
        {menu === 'turn' && (
          <div className="block-menu-turn">
            <TurnIntoMenu
              editor={editor}
              onDone={() => setMenu(null)}
              kinds={['paragraph', 'h1', 'h2', 'h3', 'h4', 'toggle', 'bullet', 'ordered', 'task', 'quote', 'callout', 'code']}
            />
          </div>
        )}
      </div>
    </DragHandle>
  )
}

import type ForceGraphType from 'force-graph'
import type { LinkObject, NodeObject } from 'force-graph'
import { Maximize, Network } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLinkIndex, useResolvedTheme } from '../lib/hooks'
import { titleOf } from '../lib/paths'
import { openNote } from '../lib/router'
import { useSettings } from '../lib/settings'
import { createNote, useVault } from '../lib/vault'

interface GNode extends NodeObject {
  id: string
  name: string
  deg: number
  ghost: boolean
}
type GLink = LinkObject<GNode>

/** A design token as a colour the canvas can paint. Tokens can be color-mix()
 *  expressions (the accent in dark mode, palettes), so let the browser resolve
 *  one onto a 1px canvas and read the pixel back. */
function tokenColor(ctx: CanvasRenderingContext2D | null, cs: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = cs.getPropertyValue(name).trim()
  if (!raw || !ctx) return raw || fallback
  if (/^(#|rgb)/i.test(raw)) return raw
  const probe = document.createElement('span')
  probe.style.color = raw
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = fallback
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

function readColors() {
  const cs = getComputedStyle(document.documentElement)
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const v = (n: string, fallback: string) => tokenColor(ctx, cs, n, fallback)
  return {
    accent: v('--accent', '#2f6bff'),
    link: v('--graph-link', 'rgba(128,128,128,0.2)'),
    node: v('--graph-node', 'rgba(128,128,128,0.6)'),
    ghost: v('--graph-ghost', 'rgba(128,128,128,0.4)'),
    text: v('--text-secondary', '#6e6e73'),
    faint: v('--text-faint', '#a1a1a6'),
    bg: v('--bg', '#ffffff'),
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface Fittable {
  getGraphBbox: () => { x: number[]; y: number[] } | null
  zoomToFit: (ms: number, pad: number) => unknown
  centerAt: (x: number, y: number, ms: number) => unknown
  zoom: (k: number, ms: number) => unknown
}

/** Zoom to show every page. With one page (or a tight clump) zoomToFit blows a
 *  single dot up to fill the screen, so those get a sensible fixed zoom. */
function fit(g: Fittable, ms: number, pad: number) {
  const box = g.getGraphBbox()
  if (box && (box.x[1] - box.x[0] > 120 || box.y[1] - box.y[0] > 120)) {
    g.zoomToFit(ms, pad)
    return
  }
  g.centerAt(box ? (box.x[0] + box.x[1]) / 2 : 0, box ? (box.y[0] + box.y[1]) / 2 : 0, ms)
  g.zoom(2.5, ms)
}

export default function GraphView() {
  const box = useRef<HTMLDivElement>(null)
  const graph = useRef<ForceGraphType<GNode, GLink> | null>(null)
  const hover = useRef<GNode | null>(null)
  const neighbors = useRef<Set<string>>(new Set())
  const paths = useVault((s) => s.paths)
  const index = useLinkIndex()
  const theme = useResolvedTheme()
  const palette = useSettings((s) => s.palette)
  const accent = useSettings((s) => s.accent)
  const [ghosts, setGhosts] = useState(false)
  const [orphans, setOrphans] = useState(true)
  const [ready, setReady] = useState(false)
  const colors = useRef(readColors())
  const fitPending = useRef(true)

  const data = useMemo(() => {
    const nodes = new Map<string, GNode>()
    const links: { source: string; target: string }[] = []
    const seen = new Set<string>()
    for (const p of paths) nodes.set(p, { id: p, name: titleOf(p), deg: 0, ghost: false })
    for (const [from, outs] of index.outgoing) {
      for (const to of outs) {
        const key = [from, to].sort().join('\u0000')
        if (seen.has(key) || !nodes.has(to)) continue
        seen.add(key)
        links.push({ source: from, target: to })
      }
    }
    if (ghosts) {
      for (const [from, names] of index.unresolved) {
        for (const n of names) {
          const id = 'ghost:' + n.toLowerCase()
          if (!nodes.has(id)) nodes.set(id, { id, name: n, deg: 0, ghost: true })
          links.push({ source: from, target: id })
        }
      }
    }
    for (const l of links) {
      nodes.get(l.source)!.deg++
      nodes.get(l.target)!.deg++
    }
    const list = [...nodes.values()].filter((n) => orphans || n.deg > 0)
    const keep = new Set(list.map((n) => n.id))
    return { nodes: list, links: links.filter((l) => keep.has(l.source) && keep.has(l.target)) }
  }, [paths, index, ghosts, orphans])

  // Create the graph once.
  useEffect(() => {
    let disposed = false
    let ro: ResizeObserver | null = null
    void Promise.all([import('force-graph'), import('d3-force-3d')]).then(([{ default: ForceGraph }, d3]) => {
      if (disposed || !box.current) return
      const el = box.current
      const g = new ForceGraph<GNode, GLink>(el)
      graph.current = g
      g.width(el.clientWidth)
        .height(el.clientHeight)
        .nodeId('id')
        .nodeLabel(() => '')
        .cooldownTicks(150)
        .onEngineStop(() => {
          // Fit once the layout has settled, not while nodes are still bunched up.
          if (fitPending.current) {
            fitPending.current = false
            fit(g, 500, 70)
          }
        })
        .linkWidth((l) => (hover.current && (l.source === hover.current || l.target === hover.current) ? 1.6 : 0.8))
        .linkColor((l) => (hover.current && (l.source === hover.current || l.target === hover.current) ? colors.current.accent : colors.current.link))
        .nodeCanvasObject((node, ctx, scale) => {
          const n = node as GNode
          const r = 3 + Math.sqrt(n.deg) * 1.6
          const isHover = hover.current?.id === n.id
          const near = neighbors.current.has(n.id)
          const dim = hover.current && !isHover && !near
          ctx.globalAlpha = dim ? 0.25 : 1
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2)
          if (n.ghost) {
            ctx.strokeStyle = colors.current.ghost
            ctx.lineWidth = 1 / scale + 0.6
            ctx.stroke()
          } else {
            ctx.fillStyle = isHover ? colors.current.accent : colors.current.node
            ctx.fill()
          }
          if (scale > 1.1 || isHover || near) {
            const size = Math.max(10 / scale, 3)
            ctx.font = `${isHover ? 600 : 500} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = n.ghost ? colors.current.faint : colors.current.text
            ctx.fillText(n.name, n.x!, n.y! + r + 2 / scale)
          }
          ctx.globalAlpha = 1
        })
        .nodePointerAreaPaint((node, color, ctx) => {
          const n = node as GNode
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, 5 + Math.sqrt(n.deg) * 1.6, 0, Math.PI * 2)
          ctx.fill()
        })
        .onNodeHover((node) => {
          hover.current = (node as GNode) ?? null
          const ns = new Set<string>()
          if (node) {
            for (const l of g.graphData().links) {
              const s = (l.source as GNode).id
              const t = (l.target as GNode).id
              if (s === node.id) ns.add(t)
              if (t === node.id) ns.add(s)
            }
          }
          neighbors.current = ns
          el.style.cursor = node ? 'pointer' : 'grab'
        })
        .onNodeClick((node) => {
          const n = node as GNode
          if (n.ghost) openNote(createNote({ title: n.name }))
          else openNote(n.id)
        })
      const charge = g.d3Force('charge') as unknown as { strength?: (n: number) => unknown } | undefined
      charge?.strength?.(-70)
      // Gentle pull to the middle so unlinked groups don't drift to the corners.
      g.d3Force('x', d3.forceX(0).strength(0.06) as never)
      g.d3Force('y', d3.forceY(0).strength(0.06) as never)
      ;(g.d3Force('link') as unknown as { distance?: (d: number) => void } | undefined)?.distance?.(45)
      ro = new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight))
      ro.observe(el)
      setReady(true)
    })
    return () => {
      disposed = true
      ro?.disconnect()
      graph.current?._destructor()
      graph.current = null
    }
  }, [])

  useEffect(() => {
    const g = graph.current
    if (!g) return
    fitPending.current = true
    g.graphData(data as unknown as { nodes: GNode[]; links: GLink[] })
  }, [data, ready])

  // Re-read the tokens after App has applied a new theme, palette or accent.
  useEffect(() => {
    const f = requestAnimationFrame(() => {
      colors.current = readColors()
      graph.current?.backgroundColor(colors.current.bg)
    })
    return () => cancelAnimationFrame(f)
  }, [theme, palette, accent, ready])

  return (
    <div className="graph-page">
      <div className="graph-canvas" ref={box} />
      <div className="graph-controls glass glass-strong">
        <div className="graph-stat">
          <Network size={15} /> {plural(data.nodes.filter((n) => !n.ghost).length, 'page')} · {plural(data.links.length, 'link')}
        </div>
        <label className="graph-toggle">
          <input type="checkbox" checked={orphans} onChange={(e) => setOrphans(e.target.checked)} /> Unlinked pages
        </label>
        <label className="graph-toggle">
          <input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} /> Missing pages
        </label>
        <button type="button" className="btn btn-sm" onClick={() => graph.current && fit(graph.current, 400, 60)}>
          <Maximize size={14} /> Fit
        </button>
      </div>
      {paths.length === 0 && <div className="graph-empty">Link pages together with [[double brackets]] and they’ll show up here.</div>}
    </div>
  )
}

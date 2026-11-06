import {
  Apple,
  Atom,
  Award,
  BookOpen,
  Brain,
  Briefcase,
  Bug,
  Calculator,
  Calendar,
  Camera,
  Car,
  Church,
  Cloud,
  Code,
  Coffee,
  Compass,
  Cross,
  Crown,
  Dumbbell,
  FlaskConical,
  Flag,
  Flame,
  Folder,
  Gamepad2,
  Gem,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  Heart,
  House,
  Key,
  Leaf,
  Lightbulb,
  Lock,
  Map as MapIcon,
  MessageCircle,
  Mountain,
  Music,
  Palette,
  PenTool,
  Pizza,
  Plane,
  Puzzle,
  Rocket,
  ShoppingCart,
  Sparkles,
  Star,
  Sun,
  Target,
  Trophy,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { memo } from 'react'
import { background, decodeIcon, isImageIcon, radius, type IconSpec } from '../lib/customIcon'

// The curated symbol set for made icons (kept small so it costs nothing to load).
export const GLYPHS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  star: Star,
  heart: Heart,
  rocket: Rocket,
  lightbulb: Lightbulb,
  brain: Brain,
  book: BookOpen,
  graduation: GraduationCap,
  calculator: Calculator,
  flask: FlaskConical,
  atom: Atom,
  code: Code,
  bug: Bug,
  pen: PenTool,
  palette: Palette,
  camera: Camera,
  music: Music,
  gamepad: Gamepad2,
  puzzle: Puzzle,
  trophy: Trophy,
  award: Award,
  target: Target,
  flag: Flag,
  flame: Flame,
  zap: Zap,
  sun: Sun,
  cloud: Cloud,
  leaf: Leaf,
  mountain: Mountain,
  globe: Globe,
  compass: Compass,
  map: MapIcon,
  plane: Plane,
  car: Car,
  house: House,
  church: Church,
  cross: Cross,
  briefcase: Briefcase,
  calendar: Calendar,
  folder: Folder,
  key: Key,
  lock: Lock,
  wrench: Wrench,
  hammer: Hammer,
  cart: ShoppingCart,
  gift: Gift,
  gem: Gem,
  crown: Crown,
  coffee: Coffee,
  pizza: Pizza,
  apple: Apple,
  dumbbell: Dumbbell,
  chat: MessageCircle,
}

function Pixels({ spec, size }: { spec: Extract<IconSpec['glyph'], { kind: 'pixels' }>; size: number }) {
  // One <rect> per horizontal run keeps even a busy 16×16 drawing light.
  const rects: React.ReactNode[] = []
  for (let y = 0; y < spec.size; y++) {
    for (let x = 0; x < spec.size; ) {
      const v = spec.cells[y * spec.size + x]
      let w = 1
      while (x + w < spec.size && spec.cells[y * spec.size + x + w] === v) w++
      if (v >= 0 && spec.palette[v]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} fill={`#${spec.palette[v]}`} />)
      x += w
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${spec.size} ${spec.size}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects}
    </svg>
  )
}

export function CustomIcon({ spec, size }: { spec: IconSpec; size: number }) {
  const g = spec.glyph
  const bg = background(spec)
  const inner = bg ? size * 0.6 : size * 0.9
  let glyph: React.ReactNode
  if (g.kind === 'icon') {
    const Icon = GLYPHS[g.name] ?? Sparkles
    glyph = <Icon size={inner} color={`#${spec.fg}`} strokeWidth={2.1} />
  } else if (g.kind === 'emoji') {
    glyph = <span style={{ fontSize: inner * 0.92, lineHeight: 1 }}>{g.value}</span>
  } else if (g.kind === 'text') {
    glyph = (
      <span style={{ fontSize: inner * (g.value.length > 2 ? 0.55 : g.value.length > 1 ? 0.7 : 0.9), fontWeight: 700, color: `#${spec.fg}`, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {g.value}
      </span>
    )
  } else {
    glyph = <Pixels spec={g} size={bg ? size * 0.72 : size} />
  }
  return (
    <span className="custom-icon" style={{ width: size, height: size, background: bg, borderRadius: radius(spec.shape) }}>
      {glyph}
    </span>
  )
}

/** Renders any page icon value: emoji, made icon, or uploaded picture. */
export const NoteIcon = memo(function NoteIcon({ value, size = 18, className }: { value: string; size?: number; className?: string }) {
  if (isImageIcon(value)) {
    return <img className={'note-icon-img ' + (className ?? '')} src={value} width={size} height={size} alt="" draggable={false} />
  }
  const spec = decodeIcon(value)
  if (spec) {
    return (
      <span className={'note-icon ' + (className ?? '')}>
        <CustomIcon spec={spec} size={size} />
      </span>
    )
  }
  return (
    <span className={'note-emoji ' + (className ?? '')} style={{ fontSize: size * 0.95, lineHeight: 1 }}>
      {value}
    </span>
  )
})

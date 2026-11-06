import type { CSSProperties } from 'react'
import '../styles/orb.css'

// The Slate AI orb: a soft swirling sphere, tinted from the accent colour so it
// follows Settings → Appearance. Used as the assistant's avatar, the tab bar's
// centre button, the Ask card on Home and the hero on the AI page.
// `thinking` spins and pulses faster while an answer is on its way.
export function Orb({ size = 40, state = 'idle', className }: { size?: number; state?: 'idle' | 'thinking'; className?: string }) {
  const cls = ['orb', state === 'thinking' && 'is-thinking', size < 32 && 'is-small', className].filter(Boolean).join(' ')
  return (
    <span className={cls} style={{ width: size, height: size, '--orb-size': `${size}px` } as CSSProperties} aria-hidden="true">
      <span className="orb-swirl" />
      <span className="orb-swirl orb-swirl-b" />
      <span className="orb-shine" />
    </span>
  )
}

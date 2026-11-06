// A soft light that follows the finger (or pointer) across a piece of Liquid
// Glass. Pair with the `glass-interactive` class, whose ::after reads --mx/--my.

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Track the pointer over `el` and expose it as --mx / --my (px). Returns a cleanup. */
export function attachGlassSheen(el: HTMLElement): () => void {
  if (reducedMotion()) return () => {}
  let frame = 0
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    // One style write per frame, however fast the pointer moves.
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${x}px`)
      el.style.setProperty('--my', `${y}px`)
    })
  }
  el.addEventListener('pointermove', move, { passive: true })
  el.addEventListener('pointerdown', move, { passive: true })
  return () => {
    cancelAnimationFrame(frame)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerdown', move)
  }
}

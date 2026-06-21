import { el } from './dom'

const COLORS = ['#f4b942', '#57d1a0', '#5bc8d6', '#e8615c', '#e8ebf3']

/**
 * A short, dependency-free confetti burst layered over `target`. Honours
 * `prefers-reduced-motion` by doing nothing. Each piece gets randomized drift,
 * spin, and timing via CSS custom properties; the layer self-removes.
 */
export function confettiBurst(target: HTMLElement, count = 40): void {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' })
  for (let i = 0; i < count; i++) {
    const piece = el('div', { class: 'confetti-piece' })
    piece.style.left = `${5 + Math.random() * 90}%`
    piece.style.background = COLORS[i % COLORS.length]!
    piece.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 80}px`)
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`)
    piece.style.setProperty('--delay', `${Math.random() * 0.18}s`)
    piece.style.setProperty('--dur', `${1.1 + Math.random() * 0.9}s`)
    if (Math.random() < 0.5) piece.style.borderRadius = '50%'
    layer.append(piece)
  }
  target.append(layer)
  window.setTimeout(() => layer.remove(), 2400)
}

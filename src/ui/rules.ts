import type { PuzzleKind } from '../lib/types'
import { el } from './dom'

/** Objective + how-to-play + controls for one puzzle type. */
interface Rules {
  title: string
  objective: string
  how: string[]
  /** Control rows; `keys` render as <kbd>, joined by the literal text between them. */
  controls: { keys: string[]; sep?: string[]; desc: string }[]
  touch: string
}

const RULES: Record<PuzzleKind, Rules> = {
  nonogram: {
    title: 'Nonogram',
    objective:
      'Fill cells to reveal a hidden picture. The numbers along each row and column are the lengths of the filled runs in that line, in order.',
    how: [
      'A clue of "3 1" means a run of 3 filled cells, then at least one empty cell, then a run of 1 — reading left-to-right for rows, top-to-bottom for columns.',
      'Mark cells you have proven empty with a cross (X). They never count, but they stop you from re-filling a square you have already ruled out.',
      'A clue dims once its line matches. Every board has a single solution reachable by pure logic — you never have to guess.',
    ],
    controls: [
      { keys: ['↑', '↓', '←', '→'], desc: 'move the cursor' },
      { keys: ['Space'], desc: 'fill / clear a cell' },
      { keys: ['X'], desc: 'cross out a cell' },
    ],
    touch: 'Tap to fill; switch the Fill / Cross toggle to mark empties; drag to paint a line.',
  },
  sudoku: {
    title: 'Sudoku',
    objective:
      'Fill the 9×9 grid so every row, every column, and every 3×3 box contains the digits 1–9 exactly once.',
    how: [
      'The bold given digits are fixed. Fill the blanks so no digit repeats in any row, column, or box.',
      'Stuck on a cell? Add pencil marks to track the candidates still possible there.',
      'Repeated digits in a unit flash red. Every puzzle has one solution, reachable by logic alone.',
    ],
    controls: [
      { keys: ['↑', '↓', '←', '→'], desc: 'move the cursor' },
      { keys: ['1', '9'], sep: ['–'], desc: 'place a digit' },
      { keys: ['⇧', '1–9'], sep: ['+'], desc: 'toggle a pencil mark' },
      { keys: ['0', 'Del'], sep: ['/'], desc: 'clear a cell' },
    ],
    touch: 'Tap a cell, then tap a number on the on-screen pad. Toggle Pencil to add candidates.',
  },
  sokoban: {
    title: 'Sokoban',
    objective: 'Push every box onto a goal — the glowing dots. Boxes turn green once they land on one.',
    how: [
      'You can only push, never pull, and only one box at a time. You cannot push a box into a wall or into another box.',
      'A box shoved into a corner (off a goal) is stuck for good, so think a move ahead before you commit.',
      'Every level is solvable by construction. Undo freely — or take a solver hint if you get tangled.',
    ],
    controls: [
      { keys: ['↑', '↓', '←', '→'], desc: 'walk — into a box to push it' },
      { keys: ['W', 'A', 'S', 'D'], desc: 'same, on WASD' },
      { keys: ['Click'], desc: 'step onto an adjacent tile' },
    ],
    touch: 'Swipe on the board to move, or tap a tile next to you to step.',
  },
}

const GLOBAL_CONTROLS: { keys: string[]; desc: string }[] = [
  { keys: ['U'], desc: 'undo' },
  { keys: ['H'], desc: 'hint (solver-powered)' },
  { keys: ['R'], desc: 'restart' },
  { keys: ['N'], desc: 'new puzzle' },
]

function kbdRow(keys: string[], sep: string[] | undefined, desc: string): HTMLElement {
  const row = el('div', { class: 'rule-control' })
  const keyWrap = el('span', { class: 'rule-keys' })
  keys.forEach((k, i) => {
    if (i) keyWrap.append(el('span', { class: 'rule-sep', text: sep?.[i - 1] ?? sep?.[0] ?? '' }))
    keyWrap.append(el('kbd', { text: k }))
  })
  row.append(keyWrap)
  if (desc) row.append(el('span', { class: 'rule-desc', text: desc }))
  return row
}

/** Open an accessible How-to-play modal for the given puzzle type. */
export function openRules(kind: PuzzleKind): void {
  // Already open? Don't stack.
  if (document.querySelector('.modal-backdrop')) return
  const r = RULES[kind]
  const opener = document.activeElement as HTMLElement | null
  const titleId = 'rules-title'

  const closeBtn = el('button', {
    class: 'modal-close',
    type: 'button',
    'aria-label': 'Close',
    text: '×',
  })
  const gotIt = el('button', { class: 'btn primary', type: 'button', text: 'Got it' })

  const body = el(
    'div',
    { class: 'modal-body' },
    el('p', { class: 'rule-objective', text: r.objective }),
    el('h3', { text: 'How to play' }),
    ...r.how.map((p) => el('p', { class: 'rule-para', text: p })),
    el('h3', { text: 'Controls' }),
    el('div', { class: 'rule-controls' }, ...r.controls.map((c) => kbdRow(c.keys, c.sep, c.desc))),
    el('div', { class: 'rule-controls' }, ...GLOBAL_CONTROLS.map((c) => kbdRow(c.keys, undefined, c.desc))),
    el('p', { class: 'rule-touch' }, el('strong', { text: 'Touch: ' }), r.touch),
  )

  const dialog = el(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    el('div', { class: 'modal-head' }, el('h2', { id: titleId, text: `${r.title} — how to play` }), closeBtn),
    body,
    el('div', { class: 'modal-foot' }, gotIt),
  )
  const backdrop = el('div', { class: 'modal-backdrop' }, dialog)

  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    backdrop.remove()
    document.body.classList.remove('modal-open')
    opener?.focus?.()
  }

  const focusable = (): HTMLElement[] =>
    Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'))

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  closeBtn.addEventListener('click', close)
  gotIt.addEventListener('click', close)
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close()
  })
  document.addEventListener('keydown', onKey, true)

  document.body.classList.add('modal-open')
  document.body.append(backdrop)
  closeBtn.focus()
}

/** Exposed for tests: the raw rules content. */
export function rulesFor(kind: PuzzleKind): Readonly<Rules> {
  return RULES[kind]
}

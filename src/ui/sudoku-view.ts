import type { Difficulty, PuzzleKind } from '../lib/types'
import { generateSudoku } from '../sudoku/generator'
import { isValidSolution } from '../sudoku/solver'
import type { SudokuPuzzle } from '../sudoku/types'
import { clear, el } from './dom'
import type { PuzzleView, StatusListener, ViewContext } from './types'

const FULL_MASK = 0x3fe // bits 1..9

interface Snapshot {
  values: number[][]
  pencil: number[][]
}

/** Validate a restored 9×9 grid: 'digit' cells are 0–9, 'mask' cells are any non-negative int. */
function is9x9(g: unknown, kind: 'digit' | 'mask'): g is number[][] {
  if (!Array.isArray(g) || g.length !== 9) return false
  for (const row of g) {
    if (!Array.isArray(row) || row.length !== 9) return false
    for (const v of row) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return false
      if (kind === 'digit' && v > 9) return false
    }
  }
  return true
}

export class SudokuView implements PuzzleView {
  readonly kind: PuzzleKind = 'sudoku'
  private readonly container: HTMLElement
  private readonly onStatus: StatusListener

  private puzzle!: SudokuPuzzle
  private given: boolean[][] = []
  private values: number[][] = []
  private pencil: number[][] = []
  private cellEls: HTMLDivElement[][] = []
  private board!: HTMLDivElement
  private pencilBtn!: HTMLButtonElement
  private pencilMode = false
  private cursor = { x: 0, y: 0 }
  private undoStack: Snapshot[] = []
  private solved = false
  private hintTimer = 0

  constructor(ctx: ViewContext) {
    this.container = ctx.container
    this.onStatus = ctx.onStatus
  }

  load(seed: string, difficulty: Difficulty): void {
    this.puzzle = generateSudoku(`sudoku:${seed}:${difficulty}`, { difficulty })
    this.given = this.puzzle.grid.map((r) => r.map((v) => v !== 0))
    this.reset()
  }

  private reset(): void {
    this.values = this.puzzle.grid.map((r) => r.slice())
    this.pencil = Array.from({ length: 9 }, () => new Array<number>(9).fill(0))
    this.undoStack = []
    this.cursor = { x: 0, y: 0 }
    this.solved = false
    this.render()
    this.emitStatus()
  }

  private render(): void {
    clear(this.container)
    const board = el('div', {
      class: 'board sudoku',
      tabindex: '0',
      role: 'grid',
      'aria-label': 'Sudoku board',
    })
    this.cellEls = []
    for (let y = 0; y < 9; y++) {
      const row: HTMLDivElement[] = []
      for (let x = 0; x < 9; x++) {
        const cell = el('div', { class: 'scell', 'data-x': x, 'data-y': y })
        row.push(cell)
        board.append(cell)
      }
      this.cellEls.push(row)
    }
    board.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    board.addEventListener('keydown', (e) => this.onKeyDown(e))
    this.container.append(board, this.buildKeypad())
    this.board = board
    this.repaint()
  }

  /** On-screen number pad for touch input (hidden on fine-pointer devices via CSS). */
  private buildKeypad(): HTMLElement {
    const pad = el('div', { class: 'keypad', role: 'group', 'aria-label': 'Number pad' })
    for (let d = 1; d <= 9; d++) {
      pad.append(
        el('button', { class: 'keypad-btn', type: 'button', text: String(d), onclick: () => this.padDigit(d) }),
      )
    }
    pad.append(
      el('button', { class: 'keypad-btn erase', type: 'button', 'aria-label': 'Erase', text: '⌫', onclick: () => this.padDigit(0) }),
    )
    this.pencilBtn = el('button', {
      class: this.pencilMode ? 'keypad-btn pencil on' : 'keypad-btn pencil',
      type: 'button',
      'aria-pressed': String(this.pencilMode),
      'aria-label': 'Pencil mode',
      text: '✎',
      onclick: () => this.togglePencilMode(),
    }) as HTMLButtonElement
    pad.append(this.pencilBtn)
    return pad
  }

  private padDigit(d: number): void {
    if (this.solved) return
    if (d === 0) this.setValue(0)
    else if (this.pencilMode) this.togglePencil(d)
    else this.setValue(d)
  }

  private togglePencilMode(): void {
    this.pencilMode = !this.pencilMode
    this.pencilBtn.setAttribute('aria-pressed', String(this.pencilMode))
    this.pencilBtn.classList.toggle('on', this.pencilMode)
  }

  private onPointerDown(e: PointerEvent): void {
    if (!(e.target instanceof HTMLElement)) return
    const cell = e.target.closest('.scell')
    if (!(cell instanceof HTMLElement)) return
    e.preventDefault()
    this.board.focus()
    this.cursor = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) }
    this.repaint()
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.solved) return
    const k = e.key
    let handled = true
    if (k === 'ArrowUp') this.move(0, -1)
    else if (k === 'ArrowDown') this.move(0, 1)
    else if (k === 'ArrowLeft') this.move(-1, 0)
    else if (k === 'ArrowRight') this.move(1, 0)
    else if (k >= '1' && k <= '9') {
      if (e.shiftKey) this.togglePencil(Number(k))
      else this.setValue(Number(k))
    } else if (k === '0' || k === 'Backspace' || k === 'Delete') {
      this.setValue(0)
    } else handled = false
    if (handled) e.preventDefault()
  }

  private move(dx: number, dy: number): void {
    this.cursor.x = Math.min(8, Math.max(0, this.cursor.x + dx))
    this.cursor.y = Math.min(8, Math.max(0, this.cursor.y + dy))
    this.repaint()
  }

  private snapshot(): void {
    this.undoStack.push({
      values: this.values.map((r) => r.slice()),
      pencil: this.pencil.map((r) => r.slice()),
    })
    if (this.undoStack.length > 500) this.undoStack.shift()
  }

  private setValue(d: number): void {
    const { x, y } = this.cursor
    if (this.given[y]![x]) return
    if (this.values[y]![x] === d) return
    this.snapshot()
    this.values[y]![x] = d
    this.pencil[y]![x] = 0
    this.repaint()
    this.checkWin()
    this.emitStatus()
  }

  private togglePencil(d: number): void {
    const { x, y } = this.cursor
    if (this.given[y]![x] || this.values[y]![x] !== 0) return
    this.snapshot()
    this.pencil[y]![x] ^= 1 << d
    this.repaint()
    this.emitStatus()
  }

  private conflictCells(): boolean[][] {
    const bad = Array.from({ length: 9 }, () => new Array<boolean>(9).fill(false))
    const mark = (cells: Array<[number, number]>): void => {
      const seen = new Map<number, [number, number]>()
      const dup = new Set<number>()
      for (const [r, c] of cells) {
        const v = this.values[r]![c]!
        if (v === 0) continue
        if (seen.has(v)) dup.add(v)
        else seen.set(v, [r, c])
      }
      for (const [r, c] of cells) {
        const v = this.values[r]![c]!
        if (v !== 0 && dup.has(v)) bad[r]![c] = true
      }
    }
    for (let i = 0; i < 9; i++) {
      mark(Array.from({ length: 9 }, (_, j) => [i, j] as [number, number]))
      mark(Array.from({ length: 9 }, (_, j) => [j, i] as [number, number]))
    }
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3
      const bc = (b % 3) * 3
      const cells: Array<[number, number]> = []
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([br + i, bc + j])
      mark(cells)
    }
    return bad
  }

  private repaint(): void {
    const conflicts = this.conflictCells()
    const cv = this.values[this.cursor.y]![this.cursor.x]!
    const { x: cx, y: cy } = this.cursor
    const sameBox = (x: number, y: number): boolean =>
      Math.floor(x / 3) === Math.floor(cx / 3) && Math.floor(y / 3) === Math.floor(cy / 3)
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const cell = this.cellEls[y]![x]!
        const v = this.values[y]![x]!
        cell.className = 'scell'
        if (x % 3 === 0 && x > 0) cell.classList.add('bx')
        if (y % 3 === 0 && y > 0) cell.classList.add('by')
        if (this.given[y]![x]) cell.classList.add('given')
        if (!this.solved && (x === cx || y === cy || sameBox(x, y))) cell.classList.add('peer')
        if (v !== 0 && v === cv) cell.classList.add('same')
        if (conflicts[y]![x]) cell.classList.add('conflict')
        if (!this.solved && x === cx && y === cy) cell.classList.add('cursor')

        clear(cell)
        if (v !== 0) {
          cell.append(document.createTextNode(String(v)))
        } else if (this.pencil[y]![x]) {
          const p = el('div', { class: 'pencil' })
          for (let d = 1; d <= 9; d++) {
            p.append(el('span', { text: this.pencil[y]![x]! & (1 << d) ? String(d) : '' }))
          }
          cell.append(p)
        }
      }
    }
  }

  private checkWin(): void {
    if (this.solved) return
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (this.values[y]![x] === 0) return
    if (isValidSolution(this.values)) {
      this.solved = true
      this.repaint()
      this.board.classList.add('won')
      this.emitStatus()
    }
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.values = prev.values
    this.pencil = prev.pencil
    this.solved = false
    this.board.classList.remove('won')
    this.repaint()
    this.emitStatus()
  }

  restart(): void {
    this.reset()
  }

  serialize(): unknown {
    return { values: this.values, pencil: this.pencil }
  }

  restore(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false
    const d = data as { values?: unknown; pencil?: unknown }
    if (!is9x9(d.values, 'digit') || !is9x9(d.pencil, 'mask')) return false
    const values = d.values
    // Given cells must match this puzzle (guards against a stale/foreign save).
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++)
        if (this.given[y]![x] && values[y]![x] !== this.puzzle.grid[y]![x]) return false
    this.values = values.map((r) => r.slice())
    // Keep only candidate bits 1..9; drop any stray bits from a tampered save.
    this.pencil = d.pencil.map((r) => r.map((v) => v & 0x3fe))
    this.undoStack = []
    this.solved = false
    this.board.classList.remove('won')
    this.repaint()
    this.checkWin()
    this.emitStatus()
    return true
  }

  /** Solver-powered hint: flag a wrong entry, else place the next logically-forced digit. */
  hint(): void {
    if (this.solved) return
    const sol = this.puzzle.solution

    // 1) Wrong entry.
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        if (this.values[y]![x] !== 0 && this.values[y]![x] !== sol[y]![x]) {
          this.cursor = { x, y }
          this.repaint()
          this.flash(x, y)
          this.emitStatus('Mistake: wrong digit here')
          return
        }
      }
    }

    // 2) Naked single (cell with one candidate).
    const candidates = (x: number, y: number): number => {
      let used = 0
      for (let k = 0; k < 9; k++) {
        used |= 1 << this.values[y]![k]!
        used |= 1 << this.values[k]![x]!
      }
      const br = Math.floor(y / 3) * 3
      const bc = Math.floor(x / 3) * 3
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) used |= 1 << this.values[br + i]![bc + j]!
      return FULL_MASK & ~used
    }
    const place = (x: number, y: number, d: number): void => {
      this.cursor = { x, y }
      this.snapshot()
      this.values[y]![x] = d
      this.pencil[y]![x] = 0
      this.repaint()
      this.flash(x, y)
      this.emitStatus('Hint placed')
      this.checkWin()
    }
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        if (this.values[y]![x] !== 0) continue
        const m = candidates(x, y)
        if (m && (m & (m - 1)) === 0) {
          place(x, y, 31 - Math.clz32(m))
          return
        }
      }
    }

    // 3) Hidden single (a digit with one home in a unit) → fall back to solution cell.
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        if (this.values[y]![x] === 0) {
          place(x, y, sol[y]![x]!)
          return
        }
      }
    }
  }

  private flash(x: number, y: number): void {
    const cell = this.cellEls[y]![x]!
    cell.classList.add('hint')
    window.clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => cell.classList.remove('hint'), 950)
  }

  focus(): void {
    this.board?.focus()
  }

  destroy(): void {
    window.clearTimeout(this.hintTimer)
    clear(this.container)
  }

  private emitStatus(note?: string): void {
    let filled = 0
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (this.values[y]![x] !== 0) filled++
    this.onStatus({
      solved: this.solved,
      progress: `${filled} / 81 placed`,
      difficulty: this.puzzle.difficulty,
      note,
    })
  }
}

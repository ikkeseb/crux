import type { Difficulty, PuzzleKind } from '../lib/types'
import { generateNonogram, NONOGRAM_PRESETS } from '../nonogram/generator'
import { EMPTY, FILLED, UNKNOWN } from '../nonogram/types'
import { gridMatchesClues, runsOf, solveLine } from '../nonogram/solver'
import type { NonogramPuzzle } from '../nonogram/types'
import { clear, el } from './dom'
import type { PuzzleView, StatusListener, ViewContext } from './types'

const CROSS = EMPTY // a player "X" mark means "known empty"

function cellPx(maxDim: number): number {
  if (maxDim <= 5) return 40
  if (maxDim <= 8) return 32
  if (maxDim <= 10) return 28
  if (maxDim <= 15) return 24
  return 20
}

export class NonogramView implements PuzzleView {
  readonly kind: PuzzleKind = 'nonogram'
  private readonly container: HTMLElement
  private readonly onStatus: StatusListener

  private puzzle!: NonogramPuzzle
  private marks: number[][] = []
  private cellEls: HTMLDivElement[][] = []
  private colClueEls: HTMLDivElement[] = []
  private rowClueEls: HTMLDivElement[] = []
  private board!: HTMLDivElement
  private cursor = { x: 0, y: 0 }
  private undoStack: number[][][] = []
  private solved = false
  private painting: number | null = null
  private lastPaint: { x: number; y: number } | null = null
  private hintTimer = 0

  constructor(ctx: ViewContext) {
    this.container = ctx.container
    this.onStatus = ctx.onStatus
    // Registered once for the view's lifetime (removed in destroy), not per render.
    window.addEventListener('pointerup', this.endPaint)
  }

  load(seed: string, difficulty: Difficulty): void {
    const size = NONOGRAM_PRESETS[difficulty]
    this.puzzle = generateNonogram(`nono:${seed}:${difficulty}`, size)
    this.reset()
  }

  private reset(): void {
    const { width, height } = this.puzzle
    this.marks = Array.from({ length: height }, () => new Array<number>(width).fill(UNKNOWN))
    this.undoStack = []
    this.cursor = { x: 0, y: 0 }
    this.solved = false
    this.render()
    this.emitStatus()
  }

  private render(): void {
    clear(this.container)
    const { width, height, clues } = this.puzzle
    const board = el('div', {
      class: 'board nono',
      tabindex: '0',
      role: 'grid',
      'aria-label': 'Nonogram board',
    })
    board.style.setProperty('--cell', `${cellPx(Math.max(width, height))}px`)
    board.style.gridTemplateColumns = `auto repeat(${width}, var(--cell))`
    board.style.gridTemplateRows = `auto repeat(${height}, var(--cell))`

    board.append(el('div', { class: 'corner' }))
    this.colClueEls = []
    for (let x = 0; x < width; x++) {
      const c = el('div', { class: 'clue col' })
      for (const n of clues.cols[x]!.length ? clues.cols[x]! : [0]) {
        c.append(el('span', { text: String(n) }))
      }
      this.colClueEls.push(c)
      board.append(c)
    }

    this.cellEls = []
    this.rowClueEls = []
    for (let y = 0; y < height; y++) {
      const rc = el('div', { class: 'clue row' })
      for (const n of clues.rows[y]!.length ? clues.rows[y]! : [0]) {
        rc.append(el('span', { text: String(n) }))
      }
      this.rowClueEls.push(rc)
      board.append(rc)

      const row: HTMLDivElement[] = []
      for (let x = 0; x < width; x++) {
        const cell = el('div', { class: 'cell', 'data-x': x, 'data-y': y })
        if (x > 0 && x % 5 === 0) cell.classList.add('b-left')
        if (y > 0 && y % 5 === 0) cell.classList.add('b-top')
        row.push(cell)
        board.append(cell)
      }
      this.cellEls.push(row)
    }

    board.addEventListener('contextmenu', (e) => e.preventDefault())
    board.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    board.addEventListener('pointerover', (e) => this.onPointerOver(e))
    board.addEventListener('keydown', (e) => this.onKeyDown(e))

    this.container.append(board)
    this.board = board
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) this.paintCell(x, y)
    this.refreshClues()
  }

  private cellFrom(target: EventTarget | null): { x: number; y: number } | null {
    if (!(target instanceof HTMLElement)) return null
    const cell = target.closest('.cell')
    if (!cell || !(cell instanceof HTMLElement)) return null
    return { x: Number(cell.dataset.x), y: Number(cell.dataset.y) }
  }

  private onPointerDown(e: PointerEvent): void {
    const pos = this.cellFrom(e.target)
    if (!pos || this.solved) return
    e.preventDefault()
    this.board.focus()
    this.snapshot()
    this.cursor = pos
    const cur = this.marks[pos.y]![pos.x]!
    if (e.button === 2) {
      this.painting = cur === CROSS ? UNKNOWN : CROSS
    } else {
      this.painting = cur === FILLED ? UNKNOWN : FILLED
    }
    this.apply(pos.x, pos.y, this.painting)
    this.lastPaint = pos
  }

  private onPointerOver(e: PointerEvent): void {
    if (this.painting === null) return
    const pos = this.cellFrom(e.target)
    if (!pos) return
    // Interpolate so a fast drag doesn't leave gaps between sampled cells.
    this.paintLine(this.lastPaint ?? pos, pos, this.painting)
    this.lastPaint = pos
  }

  private paintLine(a: { x: number; y: number }, b: { x: number; y: number }, value: number): void {
    let x = a.x
    let y = a.y
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    const sx = a.x < b.x ? 1 : -1
    const sy = a.y < b.y ? 1 : -1
    let err = dx - dy
    for (;;) {
      this.apply(x, y, value)
      if (x === b.x && y === b.y) break
      const e2 = 2 * err
      if (e2 > -dy) {
        err -= dy
        x += sx
      }
      if (e2 < dx) {
        err += dx
        y += sy
      }
    }
  }

  private endPaint = (): void => {
    if (this.painting !== null) {
      this.painting = null
      this.lastPaint = null
      this.emitStatus()
      this.checkWin()
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.solved) return
    let handled = true
    switch (e.key) {
      case 'ArrowUp':
        this.moveCursor(0, -1)
        break
      case 'ArrowDown':
        this.moveCursor(0, 1)
        break
      case 'ArrowLeft':
        this.moveCursor(-1, 0)
        break
      case 'ArrowRight':
        this.moveCursor(1, 0)
        break
      case ' ':
      case 'Enter': {
        this.snapshot()
        const cur = this.marks[this.cursor.y]![this.cursor.x]!
        this.apply(this.cursor.x, this.cursor.y, cur === FILLED ? UNKNOWN : FILLED)
        this.emitStatus()
        this.checkWin()
        break
      }
      case 'x':
      case 'X': {
        this.snapshot()
        const cur = this.marks[this.cursor.y]![this.cursor.x]!
        this.apply(this.cursor.x, this.cursor.y, cur === CROSS ? UNKNOWN : CROSS)
        this.emitStatus()
        this.checkWin()
        break
      }
      default:
        handled = false
    }
    if (handled) e.preventDefault()
  }

  private moveCursor(dx: number, dy: number): void {
    const { width, height } = this.puzzle
    const old = { ...this.cursor }
    this.cursor.x = Math.min(width - 1, Math.max(0, this.cursor.x + dx))
    this.cursor.y = Math.min(height - 1, Math.max(0, this.cursor.y + dy))
    this.paintCell(old.x, old.y)
    this.paintCell(this.cursor.x, this.cursor.y)
  }

  private apply(x: number, y: number, value: number): void {
    if (this.marks[y]![x] === value) return
    this.marks[y]![x] = value
    this.paintCell(x, y)
    this.refreshClues()
  }

  private paintCell(x: number, y: number): void {
    const el2 = this.cellEls[y]![x]!
    const v = this.marks[y]![x]!
    el2.className = 'cell'
    if (x > 0 && x % 5 === 0) el2.classList.add('b-left')
    if (y > 0 && y % 5 === 0) el2.classList.add('b-top')
    if (v === FILLED) el2.classList.add('fill')
    else if (v === CROSS) el2.classList.add('cross')
    if (!this.solved && this.cursor.x === x && this.cursor.y === y) el2.classList.add('cursor')
  }

  private lineFilled(cells: number[]): number[] {
    return runsOf(cells.map((c) => (c === FILLED ? FILLED : EMPTY)))
  }

  private eqRuns(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }

  private refreshClues(): void {
    const { width, height, clues } = this.puzzle
    for (let y = 0; y < height; y++) {
      const done = this.eqRuns(this.lineFilled(this.marks[y]!), clues.rows[y]!)
      this.rowClueEls[y]!.classList.toggle('done', done)
    }
    for (let x = 0; x < width; x++) {
      const col = this.marks.map((r) => r[x]!)
      const done = this.eqRuns(this.lineFilled(col), clues.cols[x]!)
      this.colClueEls[x]!.classList.toggle('done', done)
    }
  }

  private filledGrid(): number[][] {
    return this.marks.map((r) => r.map((c) => (c === FILLED ? 1 : 0)))
  }

  private checkWin(): void {
    if (this.solved) return
    if (gridMatchesClues(this.filledGrid(), this.puzzle.clues)) {
      this.solved = true
      // Drop the cursor outline on win.
      for (let y = 0; y < this.puzzle.height; y++)
        for (let x = 0; x < this.puzzle.width; x++) this.paintCell(x, y)
      this.board.classList.add('won')
      this.emitStatus()
    }
  }

  private snapshot(): void {
    this.undoStack.push(this.marks.map((r) => r.slice()))
    if (this.undoStack.length > 500) this.undoStack.shift()
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.marks = prev
    this.solved = false
    this.board.classList.remove('won')
    for (let y = 0; y < this.puzzle.height; y++)
      for (let x = 0; x < this.puzzle.width; x++) this.paintCell(x, y)
    this.refreshClues()
    this.emitStatus()
  }

  restart(): void {
    this.reset()
  }

  /** Solver-powered hint: flag a wrong fill, else reveal the next deducible cell. */
  hint(): void {
    if (this.solved) return
    const { width, height, clues } = this.puzzle

    // 1) A filled cell that should be empty is a mistake — point it out.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (this.marks[y]![x] === FILLED && this.puzzle.solution[y]![x] === 0) {
          this.flash(x, y)
          this.emitStatus('Mistake: this cell should be empty')
          return
        }
      }
    }

    // 2) From the player's correct progress, find the next forced cell by logic.
    const cp: number[][] = this.marks.map((row, y) =>
      row.map((v, x) => {
        const sol = this.puzzle.solution[y]![x]!
        if (v === FILLED && sol === 1) return FILLED
        if (v === CROSS && sol === 0) return EMPTY
        return UNKNOWN
      }),
    )
    const before = cp.map((r) => r.slice())
    for (let y = 0; y < height; y++) solveLine(cp[y]!, clues.rows[y]!)
    for (let x = 0; x < width; x++) {
      const col = cp.map((r) => r[x]!)
      solveLine(col, clues.cols[x]!)
      for (let y = 0; y < height; y++) cp[y]![x] = col[y]!
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (before[y]![x] === UNKNOWN && cp[y]![x] !== UNKNOWN) {
          this.snapshot()
          this.apply(x, y, cp[y]![x]!)
          this.flash(x, y)
          this.emitStatus('Hint placed')
          this.checkWin()
          return
        }
      }
    }

    // 3) Fallback: reveal any solution-filled cell not yet filled.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (this.puzzle.solution[y]![x] === 1 && this.marks[y]![x] !== FILLED) {
          this.snapshot()
          this.apply(x, y, FILLED)
          this.flash(x, y)
          this.emitStatus('Hint placed')
          this.checkWin()
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
    window.removeEventListener('pointerup', this.endPaint)
    window.clearTimeout(this.hintTimer)
    clear(this.container)
  }

  private emitStatus(note?: string): void {
    let filled = 0
    let target = 0
    for (let y = 0; y < this.puzzle.height; y++) {
      for (let x = 0; x < this.puzzle.width; x++) {
        if (this.puzzle.solution[y]![x] === 1) target++
        if (this.marks[y]![x] === FILLED) filled++
      }
    }
    this.onStatus({
      solved: this.solved,
      progress: `${filled} / ${target} filled`,
      difficulty: this.puzzle.difficulty,
      note,
    })
  }
}

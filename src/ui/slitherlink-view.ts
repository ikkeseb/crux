import type { Difficulty, PuzzleKind } from '../lib/types'
import { generateSlitherlink } from '../slitherlink/generator'
import { E_CROSS, E_LINE, E_UNKNOWN, type EdgeState, type SlitherlinkPuzzle } from '../slitherlink/types'
import { clear, el } from './dom'
import { fitSlitherlink } from './board-size'
import type { PuzzleView, StatusListener, ViewContext } from './types'

interface Snapshot {
  h: EdgeState[][]
  v: EdgeState[][]
}

/** A clicked edge, decoded from its dataset. */
interface EdgeId {
  t: 'h' | 'v'
  a: number
  b: number
}

export class SlitherlinkView implements PuzzleView {
  readonly kind: PuzzleKind = 'slitherlink'
  private readonly container: HTMLElement
  private readonly onStatus: StatusListener

  private puzzle!: SlitherlinkPuzzle
  private h: EdgeState[][] = []
  private v: EdgeState[][] = []
  private hEls: HTMLDivElement[][] = []
  private vEls: HTMLDivElement[][] = []
  private dotEls: HTMLDivElement[][] = []
  private clueEls: HTMLDivElement[][] = []
  private board!: HTMLDivElement
  /** Keyboard cursor sits on a dot (dr,dc). */
  private cursor = { dr: 0, dc: 0 }
  private undoStack: Snapshot[] = []
  private solved = false
  private hintTimer = 0
  /** Touch paint mode (mouse uses left=line / right=cross regardless). */
  private mode: 'line' | 'cross' = 'line'
  private lineBtn!: HTMLButtonElement
  private crossBtn!: HTMLButtonElement

  constructor(ctx: ViewContext) {
    this.container = ctx.container
    this.onStatus = ctx.onStatus
  }

  load(seed: string, difficulty: Difficulty): void {
    this.puzzle = generateSlitherlink(`slither:${seed}:${difficulty}`, { difficulty })
    this.reset()
  }

  private reset(): void {
    const { rows, cols } = this.puzzle
    this.h = Array.from({ length: rows + 1 }, () => new Array<EdgeState>(cols).fill(E_UNKNOWN))
    this.v = Array.from({ length: rows }, () => new Array<EdgeState>(cols + 1).fill(E_UNKNOWN))
    this.undoStack = []
    this.cursor = { dr: 0, dc: 0 }
    this.solved = false
    this.render()
    this.emitStatus()
  }

  private render(): void {
    clear(this.container)
    const { rows, cols } = this.puzzle
    const board = el('div', {
      class: 'board slither',
      tabindex: '0',
      role: 'group',
      'aria-label': 'Slitherlink board',
    })
    board.style.setProperty('--len', fitSlitherlink(cols, rows))
    board.style.gridTemplateColumns = `var(--dot) ${'var(--len) var(--dot) '.repeat(cols)}`.trim()
    board.style.gridTemplateRows = `var(--dot) ${'var(--len) var(--dot) '.repeat(rows)}`.trim()

    this.dotEls = []
    this.hEls = []
    this.vEls = []
    this.clueEls = []

    // Dots.
    for (let dr = 0; dr <= rows; dr++) {
      const row: HTMLDivElement[] = []
      for (let dc = 0; dc <= cols; dc++) {
        const dot = el('div', { class: 'dot' })
        dot.style.gridRow = String(2 * dr + 1)
        dot.style.gridColumn = String(2 * dc + 1)
        board.append(dot)
        row.push(dot)
      }
      this.dotEls.push(row)
    }

    // Horizontal edges.
    for (let dr = 0; dr <= rows; dr++) {
      const row: HTMLDivElement[] = []
      for (let c = 0; c < cols; c++) {
        const edge = el('div', { class: 'edge h', 'data-t': 'h', 'data-a': dr, 'data-b': c }, el('i'))
        edge.style.gridRow = String(2 * dr + 1)
        edge.style.gridColumn = String(2 * c + 2)
        board.append(edge)
        row.push(edge)
      }
      this.hEls.push(row)
    }

    // Vertical edges.
    for (let r = 0; r < rows; r++) {
      const row: HTMLDivElement[] = []
      for (let dc = 0; dc <= cols; dc++) {
        const edge = el('div', { class: 'edge v', 'data-t': 'v', 'data-a': r, 'data-b': dc }, el('i'))
        edge.style.gridRow = String(2 * r + 2)
        edge.style.gridColumn = String(2 * dc + 1)
        board.append(edge)
        row.push(edge)
      }
      this.vEls.push(row)
    }

    // Clue labels.
    for (let r = 0; r < rows; r++) {
      const row: HTMLDivElement[] = []
      for (let c = 0; c < cols; c++) {
        const k = this.puzzle.clues[r]![c]
        const cell = el('div', { class: 'sl-clue', text: k == null ? '' : String(k) })
        cell.style.gridRow = String(2 * r + 2)
        cell.style.gridColumn = String(2 * c + 2)
        board.append(cell)
        row.push(cell)
      }
      this.clueEls.push(row)
    }

    board.addEventListener('contextmenu', (e) => e.preventDefault())
    board.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    board.addEventListener('keydown', (e) => this.onKeyDown(e))

    this.container.append(board, this.buildModeToggle())
    this.board = board
    this.repaint()
  }

  /** Line / Cross toggle for touch input (hidden on fine-pointer devices via CSS). */
  private buildModeToggle(): HTMLElement {
    this.lineBtn = el('button', {
      class: this.mode === 'line' ? 'mode-btn on' : 'mode-btn',
      type: 'button',
      'aria-pressed': String(this.mode === 'line'),
      onclick: () => this.setMode('line'),
    }) as HTMLButtonElement
    this.lineBtn.append(el('span', { class: 'swatch line' }), 'Line')
    this.crossBtn = el('button', {
      class: this.mode === 'cross' ? 'mode-btn on' : 'mode-btn',
      type: 'button',
      'aria-pressed': String(this.mode === 'cross'),
      onclick: () => this.setMode('cross'),
    }) as HTMLButtonElement
    this.crossBtn.append(el('span', { class: 'swatch cross' }), 'Cross')
    return el('div', { class: 'painttoggle', role: 'group', 'aria-label': 'Mark mode' }, this.lineBtn, this.crossBtn)
  }

  private setMode(mode: 'line' | 'cross'): void {
    this.mode = mode
    this.lineBtn.classList.toggle('on', mode === 'line')
    this.lineBtn.setAttribute('aria-pressed', String(mode === 'line'))
    this.crossBtn.classList.toggle('on', mode === 'cross')
    this.crossBtn.setAttribute('aria-pressed', String(mode === 'cross'))
  }

  private edgeFrom(target: EventTarget | null): EdgeId | null {
    if (!(target instanceof HTMLElement)) return null
    const edge = target.closest('.edge')
    if (!(edge instanceof HTMLElement)) return null
    return { t: edge.dataset.t as 'h' | 'v', a: Number(edge.dataset.a), b: Number(edge.dataset.b) }
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.solved) return
    const id = this.edgeFrom(e.target)
    if (!id) return
    e.preventDefault()
    this.board.focus()
    // Mouse: left toggles line, right toggles cross. Touch/pen: the Line/Cross toggle decides.
    const wantCross = e.button === 2 || (e.pointerType !== 'mouse' && this.mode === 'cross')
    this.snapshot()
    this.toggleEdge(id, wantCross ? E_CROSS : E_LINE)
    // Move the keyboard cursor to one endpoint of the edge for continuity.
    this.cursor = { dr: id.a, dc: id.b }
    this.afterChange()
  }

  private getEdge(id: EdgeId): EdgeState {
    return id.t === 'h' ? this.h[id.a]![id.b]! : this.v[id.a]![id.b]!
  }

  private setEdge(id: EdgeId, val: EdgeState): void {
    if (id.t === 'h') this.h[id.a]![id.b] = val
    else this.v[id.a]![id.b] = val
  }

  /** Toggle the edge between blank and `target` (line or cross). */
  private toggleEdge(id: EdgeId, target: EdgeState): void {
    this.setEdge(id, this.getEdge(id) === target ? E_UNKNOWN : target)
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.solved) return
    const { rows, cols } = this.puzzle
    const { dr, dc } = this.cursor
    let id: EdgeId | null = null
    let nextDr = dr
    let nextDc = dc
    switch (e.key) {
      case 'ArrowUp':
        if (dr > 0) { id = { t: 'v', a: dr - 1, b: dc }; nextDr = dr - 1 }
        break
      case 'ArrowDown':
        if (dr < rows) { id = { t: 'v', a: dr, b: dc }; nextDr = dr + 1 }
        break
      case 'ArrowLeft':
        if (dc > 0) { id = { t: 'h', a: dr, b: dc - 1 }; nextDc = dc - 1 }
        break
      case 'ArrowRight':
        if (dc < cols) { id = { t: 'h', a: dr, b: dc }; nextDc = dc + 1 }
        break
      default:
        return // not ours — let it bubble (global U/H/R/N etc.)
    }
    e.preventDefault()
    if (id) {
      this.snapshot()
      this.toggleEdge(id, e.shiftKey ? E_CROSS : E_LINE)
      this.cursor = { dr: nextDr, dc: nextDc }
      this.afterChange()
    } else {
      // At the border: just move the cursor, no edge to draw.
      this.cursor = {
        dr: Math.min(rows, Math.max(0, nextDr)),
        dc: Math.min(cols, Math.max(0, nextDc)),
      }
      this.repaint()
    }
  }

  private snapshot(): void {
    this.undoStack.push({ h: this.h.map((r) => r.slice()), v: this.v.map((r) => r.slice()) })
    if (this.undoStack.length > 500) this.undoStack.shift()
  }

  private afterChange(): void {
    this.repaint()
    this.checkWin()
    this.emitStatus()
  }

  private edgeClass(state: EdgeState): string {
    return state === E_LINE ? ' line' : state === E_CROSS ? ' cross' : ''
  }

  private repaint(): void {
    const { rows, cols } = this.puzzle
    for (let dr = 0; dr <= rows; dr++) {
      for (let c = 0; c < cols; c++) {
        this.hEls[dr]![c]!.className = `edge h${this.edgeClass(this.h[dr]![c]!)}`
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let dc = 0; dc <= cols; dc++) {
        this.vEls[r]![dc]!.className = `edge v${this.edgeClass(this.v[r]![dc]!)}`
      }
    }
    // Clue satisfaction feedback.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = this.puzzle.clues[r]![c]
        const cell = this.clueEls[r]![c]!
        cell.classList.remove('sat', 'over')
        if (k != null) {
          const n = this.lineCountAround(r, c)
          if (n > k) cell.classList.add('over')
          else if (n === k) cell.classList.add('sat')
        }
      }
    }
    // Keyboard cursor.
    for (let dr = 0; dr <= rows; dr++) {
      for (let dc = 0; dc <= cols; dc++) {
        this.dotEls[dr]![dc]!.classList.toggle(
          'cursor',
          !this.solved && dr === this.cursor.dr && dc === this.cursor.dc,
        )
      }
    }
  }

  private lineCountAround(r: number, c: number): number {
    let n = 0
    if (this.h[r]![c] === E_LINE) n++
    if (this.h[r + 1]![c] === E_LINE) n++
    if (this.v[r]![c] === E_LINE) n++
    if (this.v[r]![c + 1] === E_LINE) n++
    return n
  }

  private lineCount(): number {
    let n = 0
    for (const row of this.h) for (const s of row) if (s === E_LINE) n++
    for (const row of this.v) for (const s of row) if (s === E_LINE) n++
    return n
  }

  private solutionLineCount(): number {
    const { h, v } = this.puzzle.solution
    let n = 0
    for (const row of h) for (const b of row) if (b) n++
    for (const row of v) for (const b of row) if (b) n++
    return n
  }

  private checkWin(): void {
    if (this.solved) return
    const { rows, cols } = this.puzzle
    const sol = this.puzzle.solution
    for (let dr = 0; dr <= rows; dr++)
      for (let c = 0; c < cols; c++)
        if ((this.h[dr]![c] === E_LINE) !== sol.h[dr]![c]) return
    for (let r = 0; r < rows; r++)
      for (let dc = 0; dc <= cols; dc++)
        if ((this.v[r]![dc] === E_LINE) !== sol.v[r]![dc]) return
    this.solved = true
    this.repaint()
    this.board.classList.add('won')
    this.emitStatus()
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.h = prev.h
    this.v = prev.v
    this.solved = false
    this.board.classList.remove('won')
    this.repaint()
    this.emitStatus()
  }

  restart(): void {
    this.reset()
  }

  serialize(): unknown {
    return { h: this.h, v: this.v }
  }

  restore(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false
    const d = data as { h?: unknown; v?: unknown }
    const { rows, cols } = this.puzzle
    if (!this.isStateGrid(d.h, rows + 1, cols) || !this.isStateGrid(d.v, rows, cols + 1)) return false
    this.h = (d.h as EdgeState[][]).map((r) => r.slice())
    this.v = (d.v as EdgeState[][]).map((r) => r.slice())
    this.undoStack = []
    this.solved = false
    this.board.classList.remove('won')
    this.repaint()
    this.checkWin()
    this.emitStatus()
    return true
  }

  private isStateGrid(g: unknown, h: number, w: number): g is EdgeState[][] {
    if (!Array.isArray(g) || g.length !== h) return false
    for (const row of g) {
      if (!Array.isArray(row) || row.length !== w) return false
      for (const val of row) if (val !== E_UNKNOWN && val !== E_LINE && val !== E_CROSS) return false
    }
    return true
  }

  /** Solver-powered hint: flag a wrong mark, else reveal the next forced loop edge. */
  hint(): void {
    if (this.solved) return
    const { rows, cols } = this.puzzle
    const sol = this.puzzle.solution

    // 1) A drawn line where the solution has none — or a cross where the loop runs.
    const isMistake = (state: EdgeState, onLoop: boolean): boolean =>
      (state === E_LINE && !onLoop) || (state === E_CROSS && onLoop)
    for (let dr = 0; dr <= rows; dr++)
      for (let c = 0; c < cols; c++)
        if (isMistake(this.h[dr]![c]!, sol.h[dr]![c]!)) {
          this.flash('h', dr, c)
          this.emitStatus('Mistake: this mark contradicts the loop', 'warn')
          return
        }
    for (let r = 0; r < rows; r++)
      for (let dc = 0; dc <= cols; dc++)
        if (isMistake(this.v[r]![dc]!, sol.v[r]![dc]!)) {
          this.flash('v', r, dc)
          this.emitStatus('Mistake: this mark contradicts the loop', 'warn')
          return
        }

    // 2) A dot that already has one correct loop edge forces its second — reveal it.
    const forced = this.findForcedEdge()
    const reveal = forced ?? this.firstMissingLoopEdge()
    if (reveal) {
      this.snapshot()
      this.setEdge(reveal, E_LINE)
      this.flash(reveal.t, reveal.a, reveal.b)
      this.repaint()
      this.checkWin()
      this.emitStatus('Hint placed')
    }
  }

  /** Solution edges incident to dot (dr,dc), as EdgeIds. */
  private loopEdgesAtDot(dr: number, dc: number): EdgeId[] {
    const { rows, cols } = this.puzzle
    const sol = this.puzzle.solution
    const out: EdgeId[] = []
    if (dr > 0 && sol.v[dr - 1]![dc]) out.push({ t: 'v', a: dr - 1, b: dc })
    if (dr < rows && sol.v[dr]![dc]) out.push({ t: 'v', a: dr, b: dc })
    if (dc > 0 && sol.h[dr]![dc - 1]) out.push({ t: 'h', a: dr, b: dc - 1 })
    if (dc < cols && sol.h[dr]![dc]) out.push({ t: 'h', a: dr, b: dc })
    return out
  }

  /** A dot with exactly one of its two loop edges drawn → the other is forced. */
  private findForcedEdge(): EdgeId | null {
    const { rows, cols } = this.puzzle
    for (let dr = 0; dr <= rows; dr++) {
      for (let dc = 0; dc <= cols; dc++) {
        const edges = this.loopEdgesAtDot(dr, dc)
        if (edges.length !== 2) continue
        const drawn = edges.filter((id) => this.getEdge(id) === E_LINE)
        if (drawn.length === 1) {
          const missing = edges.find((id) => this.getEdge(id) !== E_LINE)
          if (missing) return missing
        }
      }
    }
    return null
  }

  private firstMissingLoopEdge(): EdgeId | null {
    const { rows, cols } = this.puzzle
    const sol = this.puzzle.solution
    for (let dr = 0; dr <= rows; dr++)
      for (let c = 0; c < cols; c++)
        if (sol.h[dr]![c] && this.h[dr]![c] !== E_LINE) return { t: 'h', a: dr, b: c }
    for (let r = 0; r < rows; r++)
      for (let dc = 0; dc <= cols; dc++)
        if (sol.v[r]![dc] && this.v[r]![dc] !== E_LINE) return { t: 'v', a: r, b: dc }
    return null
  }

  private flash(t: 'h' | 'v', a: number, b: number): void {
    const eln = t === 'h' ? this.hEls[a]![b]! : this.vEls[a]![b]!
    eln.classList.add('hint')
    window.clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => eln.classList.remove('hint'), 950)
  }

  focus(): void {
    this.board?.focus()
  }

  destroy(): void {
    window.clearTimeout(this.hintTimer)
    clear(this.container)
  }

  private emitStatus(note?: string, noteTone: 'info' | 'warn' = 'info'): void {
    this.onStatus({
      solved: this.solved,
      progress: `${this.lineCount()} / ${this.solutionLineCount()} edges`,
      difficulty: this.puzzle.difficulty,
      note,
      noteTone,
    })
  }
}

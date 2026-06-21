import type { Difficulty, PuzzleKind } from '../lib/types'
import { generateSokoban } from '../sokoban/generator'
import { solveSokoban } from '../sokoban/solver'
import { DIRS, applyMove, charToDir, isSolved } from '../sokoban/level'
import type { SokobanLevel, SokobanPuzzle } from '../sokoban/types'
import { clear, el } from './dom'
import type { PuzzleView, StatusListener, ViewContext } from './types'

function cellPx(maxDim: number): number {
  if (maxDim <= 7) return 46
  if (maxDim <= 9) return 40
  if (maxDim <= 12) return 34
  return 28
}

interface State {
  boxes: number[]
  player: number
}

interface Snapshot extends State {
  pushes: number
  moves: number
}

export class SokobanView implements PuzzleView {
  readonly kind: PuzzleKind = 'sokoban'
  private readonly container: HTMLElement
  private readonly onStatus: StatusListener

  private puzzle!: SokobanPuzzle
  private level!: SokobanLevel
  private state: State = { boxes: [], player: -1 }
  private tileEls: HTMLDivElement[] = []
  private board!: HTMLDivElement
  private undoStack: Snapshot[] = []
  private pushes = 0
  private moves = 0
  private solved = false
  private hintTimer = 0
  private touchStart: { x: number; y: number; tile: number } | null = null

  constructor(ctx: ViewContext) {
    this.container = ctx.container
    this.onStatus = ctx.onStatus
  }

  load(seed: string, difficulty: Difficulty): void {
    this.puzzle = generateSokoban(`sokoban:${seed}:${difficulty}`, { difficulty })
    this.level = this.puzzle.level
    this.reset()
  }

  private reset(): void {
    this.state = { boxes: this.level.boxes.slice(), player: this.level.player }
    this.undoStack = []
    this.pushes = 0
    this.moves = 0
    this.solved = false
    this.render()
    this.emitStatus()
  }

  private render(): void {
    clear(this.container)
    const { width, height } = this.level
    const board = el('div', {
      class: 'board sokoban',
      tabindex: '0',
      role: 'grid',
      'aria-label': 'Sokoban board',
    })
    // Inline cells can't be hit by a media query — bake the viewport cap in so
    // larger boards shrink to fit a phone instead of overflowing under touch-action:none.
    const cap = cellPx(Math.max(width, height))
    board.style.setProperty('--cell', `min(${cap}px, calc((100vw - 5rem) / ${width}))`)
    board.style.gridTemplateColumns = `repeat(${width}, var(--cell))`

    this.tileEls = []
    for (let i = 0; i < width * height; i++) {
      const tile = el('div', { class: 'tile', 'data-i': i })
      this.tileEls.push(tile)
      board.append(tile)
    }
    board.addEventListener('keydown', (e) => this.onKeyDown(e))
    board.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    board.addEventListener('pointerup', (e) => this.onPointerUp(e))
    board.addEventListener('pointercancel', (e) => this.onPointerCancel(e))
    this.container.append(board)
    this.board = board
    this.repaint()
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.solved) return
    const map: Record<string, number> = {
      ArrowUp: 0,
      w: 0,
      ArrowDown: 1,
      s: 1,
      ArrowLeft: 2,
      a: 2,
      ArrowRight: 3,
      d: 3,
    }
    const dir = map[e.key]
    if (dir === undefined) return
    e.preventDefault()
    this.doMove(dir)
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.solved) return
    this.touchStart = { x: e.clientX, y: e.clientY, tile: this.tileIndexFrom(e.target) }
    // Capture so the matching pointerup lands here even if the finger drifts off-board.
    try {
      this.board.setPointerCapture(e.pointerId)
    } catch {
      // capture is best-effort
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const start = this.touchStart
    this.touchStart = null
    if (this.solved || !start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const SWIPE = 24
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE) {
      // Swipe: move in the dominant axis. DIRS: 0=up 1=down 2=left 3=right.
      this.board.focus()
      this.doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 1 : 0)
    } else if (start.tile >= 0) {
      // Tap: step onto the pressed tile if it neighbours the player.
      this.board.focus()
      this.stepToTile(start.tile)
    }
  }

  private onPointerCancel(e: PointerEvent): void {
    // Interrupted touch (e.g. system gesture): drop the pending tap/swipe and capture.
    this.touchStart = null
    try {
      this.board.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
  }

  private tileIndexFrom(target: EventTarget | null): number {
    if (!(target instanceof HTMLElement)) return -1
    const tile = target.closest('.tile')
    return tile instanceof HTMLElement ? Number(tile.dataset.i) : -1
  }

  private stepToTile(i: number): void {
    const W = this.level.width
    const pr = Math.floor(this.state.player / W)
    const pc = this.state.player % W
    const tr = Math.floor(i / W)
    const tc = i % W
    for (let di = 0; di < DIRS.length; di++) {
      const d = DIRS[di]!
      if (pr + d.dr === tr && pc + d.dc === tc) {
        this.doMove(di)
        return
      }
    }
  }

  private doMove(dir: number): void {
    const next = applyMove(this.level, this.state, dir)
    if (next === null) return
    this.undoStack.push({
      boxes: this.state.boxes.slice(),
      player: this.state.player,
      pushes: this.pushes,
      moves: this.moves,
    })
    if (this.undoStack.length > 2000) this.undoStack.shift()
    this.state = { boxes: next.boxes, player: next.player }
    this.moves++
    if (next.pushed) this.pushes++
    this.repaint()
    this.checkWin()
    this.emitStatus()
  }

  private repaint(): void {
    const { width, height, walls, goals } = this.level
    const boxSet = new Set(this.state.boxes)
    for (let i = 0; i < width * height; i++) {
      const tile = this.tileEls[i]!
      tile.className = 'tile'
      clear(tile)
      if (walls[i]) {
        tile.classList.add('wall')
        continue
      }
      tile.classList.add('floor')
      if (goals[i]) tile.classList.add('goal')
      if (boxSet.has(i)) {
        if (goals[i]) tile.classList.add('on-goal')
        tile.append(el('div', { class: 'box' }))
      }
      if (i === this.state.player) {
        if (goals[i]) tile.classList.add('on-goal-player')
        tile.append(el('div', { class: 'player' }))
      }
    }
  }

  private checkWin(): void {
    if (this.solved) return
    if (isSolved(this.level, this.state.boxes)) {
      this.solved = true
      this.board.classList.add('won')
      this.emitStatus()
    }
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.state = { boxes: prev.boxes, player: prev.player }
    this.pushes = prev.pushes
    this.moves = prev.moves
    this.solved = false
    this.board.classList.remove('won')
    this.repaint()
    this.emitStatus()
  }

  restart(): void {
    this.reset()
  }

  serialize(): unknown {
    return { boxes: this.state.boxes, player: this.state.player, moves: this.moves, pushes: this.pushes }
  }

  restore(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false
    const d = data as { boxes?: unknown; player?: unknown; moves?: unknown; pushes?: unknown }
    const { width, height, walls } = this.level
    const n = width * height
    const onFloor = (i: unknown): i is number =>
      typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < n && !walls[i]
    if (!Array.isArray(d.boxes) || d.boxes.length !== this.level.boxes.length) return false
    if (!d.boxes.every(onFloor) || new Set(d.boxes).size !== d.boxes.length) return false
    if (!onFloor(d.player) || d.boxes.includes(d.player)) return false
    this.state = { boxes: (d.boxes as number[]).slice(), player: d.player }
    this.moves = typeof d.moves === 'number' && d.moves >= 0 ? d.moves : 0
    this.pushes = typeof d.pushes === 'number' && d.pushes >= 0 ? d.pushes : 0
    this.undoStack = []
    this.solved = false
    this.board.classList.remove('won')
    this.repaint()
    this.checkWin()
    this.emitStatus()
    return true
  }

  /** Solver-powered hint: take one step of the optimal solution from the current state. */
  hint(): void {
    if (this.solved) return
    const current: SokobanLevel = {
      ...this.level,
      boxes: this.state.boxes.slice().sort((a, b) => a - b),
      player: this.state.player,
    }
    const sol = solveSokoban(current)
    if (sol.status !== 'solved' || sol.moves.length === 0) {
      this.emitStatus(
        sol.status === 'capped' ? 'Too tangled to hint — try undo' : 'Stuck — press undo',
      )
      return
    }
    const dir = charToDir(sol.moves[0]!)
    if (dir < 0) return
    this.doMove(dir)
    this.flash(this.state.player)
    this.emitStatus('Hint: one step taken')
  }

  private flash(i: number): void {
    const tile = this.tileEls[i]
    if (!tile) return
    tile.classList.add('hint')
    window.clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => tile.classList.remove('hint'), 950)
  }

  focus(): void {
    this.board?.focus()
  }

  destroy(): void {
    window.clearTimeout(this.hintTimer)
    clear(this.container)
  }

  private emitStatus(note?: string): void {
    const onGoal = this.state.boxes.filter((b) => this.level.goals[b]).length
    this.onStatus({
      solved: this.solved,
      progress: `${onGoal}/${this.state.boxes.length} · ${this.pushes}p`,
      difficulty: this.puzzle.difficulty,
      note,
    })
  }
}

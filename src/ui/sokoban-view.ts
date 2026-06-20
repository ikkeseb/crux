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
    board.style.setProperty('--cell', `${cellPx(Math.max(width, height))}px`)
    board.style.gridTemplateColumns = `repeat(${width}, var(--cell))`

    this.tileEls = []
    for (let i = 0; i < width * height; i++) {
      const tile = el('div', { class: 'tile', 'data-i': i })
      this.tileEls.push(tile)
      board.append(tile)
    }
    board.addEventListener('keydown', (e) => this.onKeyDown(e))
    board.addEventListener('pointerdown', (e) => this.onPointerDown(e))
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
    if (this.solved || !(e.target instanceof HTMLElement)) return
    const tile = e.target.closest('.tile')
    if (!(tile instanceof HTMLElement)) return
    const i = Number(tile.dataset.i)
    const W = this.level.width
    const pr = Math.floor(this.state.player / W)
    const pc = this.state.player % W
    const tr = Math.floor(i / W)
    const tc = i % W
    for (let di = 0; di < DIRS.length; di++) {
      const d = DIRS[di]!
      if (pr + d.dr === tr && pc + d.dc === tc) {
        this.board.focus()
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

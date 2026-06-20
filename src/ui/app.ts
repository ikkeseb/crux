import type { Difficulty, PuzzleKind } from '../lib/types'
import { DIFFICULTIES, PUZZLE_KINDS } from '../lib/types'
import { dateKey } from '../lib/daily'
import { clear, el } from './dom'
import type { PuzzleStatus, PuzzleView } from './types'
import { NonogramView } from './nonogram-view'
import { SudokuView } from './sudoku-view'
import { SokobanView } from './sokoban-view'

const KIND_LABEL: Record<PuzzleKind, string> = {
  nonogram: 'Nonogram',
  sudoku: 'Sudoku',
  sokoban: 'Sokoban',
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
}

function kbd(...keys: string[]): HTMLElement {
  const span = el('span')
  keys.forEach((k, i) => {
    if (i) span.append(' ')
    span.append(el('kbd', { text: k }))
  })
  return span
}

function legendFor(kind: PuzzleKind): HTMLElement {
  const wrap = el('div', { class: 'legend' })
  const line = (label: HTMLElement, text: string): HTMLElement =>
    el('div', {}, label, ' ', text)
  if (kind === 'nonogram') {
    wrap.append(
      line(kbd('↑', '↓', '←', '→'), 'move'),
      line(kbd('Space'), 'fill · drag to paint'),
      line(kbd('X'), 'cross · right-drag to cross'),
    )
  } else if (kind === 'sudoku') {
    wrap.append(
      line(kbd('↑', '↓', '←', '→'), 'move'),
      line(kbd('1', '–', '9'), 'place digit'),
      line(kbd('⇧', '1–9'), 'pencil mark · '),
      line(kbd('0', 'Del'), 'clear'),
    )
  } else {
    wrap.append(
      line(kbd('↑', '↓', '←', '→'), 'or'),
      line(kbd('W', 'A', 'S', 'D'), 'push boxes'),
      el('div', { text: 'Click a tile next to you to step.' }),
    )
  }
  wrap.append(
    el('div', { class: 'legend-global' }, kbd('U'), ' undo · ', kbd('H'), ' hint · ', kbd('R'), ' restart · ', kbd('N'), ' new'),
  )
  return wrap
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

export class App {
  private readonly root: HTMLElement
  private kind: PuzzleKind = 'nonogram'
  private difficulty: Difficulty = 'easy'
  private daily = false
  private seed = randomSeed()
  private view: PuzzleView | null = null

  // DOM refs
  private boardContainer!: HTMLElement
  private tabEls = new Map<PuzzleKind, HTMLButtonElement>()
  private difficultySelect!: HTMLSelectElement
  private dailyBtn!: HTMLButtonElement
  private legendSlot!: HTMLElement
  private progressEl!: HTMLElement
  private diffBadge!: HTMLElement
  private seedEl!: HTMLElement
  private timeEl!: HTMLElement
  private noteEl!: HTMLElement
  private banner!: HTMLElement
  private bannerTime!: HTMLElement

  // timer
  private timerHandle = 0
  private startedAt = 0
  private elapsedMs = 0
  private running = false
  private solvedShown = false

  constructor(root: HTMLElement) {
    this.root = root
  }

  mount(): void {
    clear(this.root)
    this.root.classList.add('app')
    this.root.append(this.buildTopbar(), this.buildStage())
    this.selectKind('nonogram', false)
    this.newGame(true)
    this.bindGlobalKeys()
  }

  private buildTopbar(): HTMLElement {
    const brand = el('div', { class: 'brand' }, 'crux', el('span', { class: 'dot' }))

    const tabs = el('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Puzzle type' })
    for (const kind of PUZZLE_KINDS) {
      const tab = el('button', {
        class: 'tab',
        role: 'tab',
        type: 'button',
        text: KIND_LABEL[kind],
        onclick: () => this.selectKind(kind, true),
      })
      this.tabEls.set(kind, tab)
      tabs.append(tab)
    }

    this.difficultySelect = el('select', {
      class: 'select',
      'aria-label': 'Difficulty',
      onchange: () => {
        this.difficulty = this.difficultySelect.value as Difficulty
        this.newGame(false)
      },
    }) as HTMLSelectElement
    for (const d of DIFFICULTIES) {
      this.difficultySelect.append(el('option', { value: d, text: DIFFICULTY_LABEL[d] }))
    }
    this.difficultySelect.value = this.difficulty

    this.dailyBtn = el('button', {
      class: 'btn ghost',
      type: 'button',
      'aria-pressed': 'false',
      text: 'Daily',
      onclick: () => this.toggleDaily(),
    }) as HTMLButtonElement

    const newBtn = el(
      'button',
      { class: 'btn primary', type: 'button', onclick: () => this.newGame(true) },
      'New puzzle',
      el('span', { class: 'key', text: 'N' }),
    )

    const toolset = el(
      'div',
      { class: 'toolset' },
      el('label', { class: 'field' }, 'Level', this.difficultySelect),
      this.dailyBtn,
      newBtn,
    )

    return el('header', { class: 'topbar' }, brand, tabs, el('div', { class: 'topbar-spacer' }), toolset)
  }

  private buildStage(): HTMLElement {
    this.boardContainer = el('div', { class: 'board-panel' })

    this.banner = el(
      'div',
      { class: 'banner', role: 'status' },
      '✓ Solved!',
      (this.bannerTime = el('span', { class: 'time' })),
    )

    this.diffBadge = el('span', { class: 'badge' })
    this.progressEl = el('span', { class: 'value', text: '—' })
    this.timeEl = el('span', { class: 'value', text: '0:00' })
    this.seedEl = el('span', { class: 'value seed' })
    this.noteEl = el('div', { class: 'note' })

    const statusCard = el(
      'div',
      { class: 'card' },
      el('h2', { text: 'Status' }),
      el('div', { class: 'statline' }, el('span', { class: 'label', text: 'Difficulty' }), this.diffBadge),
      el('div', { class: 'statline' }, el('span', { class: 'label', text: 'Progress' }), this.progressEl),
      el('div', { class: 'statline' }, el('span', { class: 'label', text: 'Time' }), this.timeEl),
      el('div', { class: 'statline' }, el('span', { class: 'label', text: 'Seed' }), this.seedEl),
      this.noteEl,
    )

    const controlsCard = el(
      'div',
      { class: 'card' },
      el('h2', { text: 'Controls' }),
      el(
        'div',
        { class: 'actions' },
        el('button', { class: 'btn', type: 'button', onclick: () => this.act('undo') }, 'Undo', el('span', { class: 'key', text: 'U' })),
        el('button', { class: 'btn', type: 'button', onclick: () => this.act('hint') }, 'Hint', el('span', { class: 'key', text: 'H' })),
        el('button', { class: 'btn', type: 'button', onclick: () => this.act('restart') }, 'Restart', el('span', { class: 'key', text: 'R' })),
      ),
    )

    this.legendSlot = el('div', { class: 'card' }, el('h2', { text: 'Keys' }))

    const sidebar = el('aside', { class: 'sidebar' }, this.banner, statusCard, controlsCard, this.legendSlot)
    return el('main', { class: 'stage' }, this.boardContainer, sidebar)
  }

  private selectKind(kind: PuzzleKind, regenerate: boolean): void {
    if (this.view && this.kind === kind) return
    this.kind = kind
    for (const [k, tab] of this.tabEls) tab.setAttribute('aria-selected', String(k === kind))

    this.view?.destroy()
    const ctx = { container: this.boardContainer, onStatus: (s: PuzzleStatus) => this.onStatus(s) }
    this.view = kind === 'nonogram' ? new NonogramView(ctx) : kind === 'sudoku' ? new SudokuView(ctx) : new SokobanView(ctx)

    // refresh legend
    clear(this.legendSlot)
    this.legendSlot.append(el('h2', { text: 'Keys' }), legendFor(kind))

    if (regenerate) this.newGame(false)
  }

  private toggleDaily(): void {
    this.daily = !this.daily
    this.dailyBtn.setAttribute('aria-pressed', String(this.daily))
    this.newGame(true)
  }

  private newGame(newSeed: boolean): void {
    if (!this.view) return
    if (this.daily) this.seed = dateKey(new Date())
    else if (newSeed) this.seed = randomSeed()

    this.view.load(this.seed, this.difficulty)
    this.seedEl.textContent = this.daily ? `daily ${this.seed}` : this.seed
    this.banner.classList.remove('show')
    this.startTimer()
    this.view.focus()
  }

  private act(kind: 'undo' | 'hint' | 'restart'): void {
    if (!this.view) return
    if (kind === 'undo') this.view.undo()
    else if (kind === 'hint') this.view.hint()
    else this.view.restart()
    if (kind === 'restart') {
      this.banner.classList.remove('show')
      this.startTimer()
    }
    this.view.focus()
  }

  private onStatus(s: PuzzleStatus): void {
    this.progressEl.textContent = s.progress
    this.diffBadge.textContent = DIFFICULTY_LABEL[s.difficulty]
    this.diffBadge.className = `badge ${s.difficulty}`
    this.noteEl.textContent = s.note ?? ''
    if (s.solved && !this.solvedShown) {
      this.solvedShown = true
      this.stopTimer()
      this.bannerTime.textContent = this.formatTime(this.elapsedMs)
      this.banner.classList.add('show')
    } else if (!s.solved && this.solvedShown) {
      // Undo took the board back out of a solved state: clear the win and resume timing.
      this.solvedShown = false
      this.banner.classList.remove('show')
      this.resumeTimer()
    }
  }

  // ---- timer ----
  private runTimer(): void {
    this.running = true
    this.timerHandle = window.setInterval(() => {
      this.elapsedMs = Date.now() - this.startedAt
      this.timeEl.textContent = this.formatTime(this.elapsedMs)
    }, 500)
  }

  private startTimer(): void {
    this.stopTimer()
    this.solvedShown = false
    this.elapsedMs = 0
    this.startedAt = Date.now()
    this.timeEl.textContent = '0:00'
    this.runTimer()
  }

  private resumeTimer(): void {
    if (this.running) return
    this.startedAt = Date.now() - this.elapsedMs
    this.runTimer()
  }

  private stopTimer(): void {
    if (this.timerHandle) window.clearInterval(this.timerHandle)
    this.timerHandle = 0
    if (this.running) this.elapsedMs = Date.now() - this.startedAt
    this.running = false
  }

  private formatTime(ms: number): string {
    const total = Math.floor(ms / 1000)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${`${s}`.padStart(2, '0')}`
  }

  private bindGlobalKeys(): void {
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLSelectElement) return
      switch (e.key) {
        case 'u':
          this.act('undo')
          break
        case 'h':
          this.act('hint')
          break
        case 'r':
          this.act('restart')
          break
        case 'n':
          this.newGame(true)
          break
        default:
          return
      }
      e.preventDefault()
    })
  }
}

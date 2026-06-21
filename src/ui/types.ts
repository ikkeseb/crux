import type { Difficulty, PuzzleKind } from '../lib/types'

export interface PuzzleStatus {
  /** The board is fully and correctly solved. */
  solved: boolean
  /** Short progress text for the sidebar, e.g. "23 / 56 filled" or "4 conflicts". */
  progress: string
  /** Graded difficulty of the loaded puzzle. */
  difficulty: Difficulty
  /** Transient note (hint placed, mistake found, …); cleared on next action. */
  note?: string
}

export type StatusListener = (status: PuzzleStatus) => void

/** Every puzzle view implements this so the app shell can drive them uniformly. */
export interface PuzzleView {
  readonly kind: PuzzleKind
  /** Generate and render a puzzle for this seed + difficulty. */
  load(seed: string, difficulty: Difficulty): void
  undo(): void
  hint(): void
  restart(): void
  /** Give the board keyboard focus. */
  focus(): void
  destroy(): void
  /** Snapshot the in-progress board for persistence. */
  serialize(): unknown
  /** Apply a previously-serialized snapshot; returns false if it doesn't fit this puzzle. */
  restore(data: unknown): boolean
}

export interface ViewContext {
  container: HTMLElement
  onStatus: StatusListener
}

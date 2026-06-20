import type { Difficulty } from '../lib/types'

/**
 * Cell encoding used while solving:
 *   UNKNOWN (-1) — not yet determined
 *   EMPTY    (0) — known blank
 *   FILLED   (1) — known filled
 * A *solution* grid only ever contains EMPTY/FILLED.
 */
export const UNKNOWN = -1 as const
export const EMPTY = 0 as const
export const FILLED = 1 as const

export type CellState = -1 | 0 | 1

/** Run-length clues: `rows[y]` are the block lengths for row y, `cols[x]` for column x. */
export interface NonogramClues {
  readonly rows: number[][]
  readonly cols: number[][]
}

export type SolveStatus = 'unique' | 'multiple' | 'none'

export interface NonogramSolveStats {
  /** Fixpoint iterations of line propagation (includes the final no-change sweep). */
  propagationRounds: number
  /** Total individual line solves performed. */
  lineSolves: number
  /** Backtracking branch points (cells guessed). */
  guesses: number
  /** Deepest backtracking recursion reached. */
  maxDepth: number
  /** Whether any guessing was required (i.e. not pure logic). */
  usedBacktracking: boolean
}

export interface NonogramSolution {
  status: SolveStatus
  /** A concrete solution grid (the first found), or null if none exists. */
  grid: number[][] | null
  /** Number of solutions found, capped by the solver's `solutionCap`. */
  solutionCount: number
  stats: NonogramSolveStats
}

export interface NonogramPuzzle {
  width: number
  height: number
  clues: NonogramClues
  /** The unique solution (0/1), kept for hints and instant win-checks. */
  solution: number[][]
  seed: string
  difficulty: Difficulty
  /** Raw graded score (higher = harder); difficulty is a banding of this. */
  score: number
}

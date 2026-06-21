import type { Difficulty } from '../lib/types'

/**
 * Edge states, shared by solver and player view:
 *   E_UNKNOWN (0) — not yet decided
 *   E_LINE    (1) — edge is part of the loop
 *   E_CROSS   (2) — edge is proven *not* part of the loop
 */
export const E_UNKNOWN = 0 as const
export const E_LINE = 1 as const
export const E_CROSS = 2 as const

export type EdgeState = 0 | 1 | 2

/** A cell clue: how many of the cell's 4 edges lie on the loop (0–3), or null = blank. */
export type Clue = number | null

/**
 * The loop, as edge membership over the dot lattice of an `rows × cols` cell grid.
 *
 *   h[dr][c]  horizontal edge on dot-row `dr` (0..rows) spanning cell columns c→c+1.
 *             Dimensions (rows+1) × cols.
 *   v[r][dc]  vertical edge on dot-col `dc` (0..cols) spanning cell rows r→r+1.
 *             Dimensions rows × (cols+1).
 *
 * Cell (r,c) is bounded by top h[r][c], bottom h[r+1][c], left v[r][c], right v[r][c+1].
 */
export interface Loop {
  h: boolean[][]
  v: boolean[][]
}

export type SolveStatus = 'unique' | 'multiple' | 'none'

export interface SlitherlinkSolveStats {
  /** Fixpoint iterations of edge propagation (includes the final no-change sweep). */
  propagationRounds: number
  /** Edges forced (to LINE or CROSS) by propagation across the whole solve. */
  forced: number
  /** Backtracking branch points (edges guessed). */
  guesses: number
  /** Deepest backtracking recursion reached. */
  maxDepth: number
  /** Whether any guessing was required (i.e. not pure propagation). */
  usedBacktracking: boolean
}

export interface SlitherlinkSolution {
  status: SolveStatus
  /** The first solution loop found, or null if none. */
  loop: Loop | null
  /** Number of valid single-loop solutions found, capped by the solver's cap. */
  solutionCount: number
  stats: SlitherlinkSolveStats
}

export interface SlitherlinkGrade {
  score: number
  difficulty: Difficulty
}

export interface SlitherlinkPuzzle {
  rows: number
  cols: number
  /** Clues as presented (0–3 or null). */
  clues: Clue[][]
  /** The unique solution loop. */
  solution: Loop
  /** Number of non-null clues (analogous to sudoku givens). */
  clueCount: number
  seed: string
  difficulty: Difficulty
  /** Raw graded score (higher = harder); difficulty is a banding of this. */
  score: number
}

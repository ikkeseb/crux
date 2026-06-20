import type { Difficulty } from '../lib/types'

/**
 * A Sokoban level. Cells are addressed by index = row * width + col.
 * `walls` and `goals` are static; `boxes`/`player` are the starting dynamic state.
 */
export interface SokobanLevel {
  width: number
  height: number
  walls: boolean[]
  goals: boolean[]
  /** Starting box cells, kept sorted ascending. */
  boxes: number[]
  /** Starting player cell. */
  player: number
}

/** One box push: the box at `from` moves one step in direction `dir` (index into DIRS). */
export interface Push {
  from: number
  dir: number
}

export interface SokobanSolveStats {
  /** States popped from the open set. */
  expanded: number
  /** Successor states generated. */
  generated: number
  /** Number of pushes in the solution. */
  pushLength: number
  /** Number of player moves (LURD length) in the solution. */
  moveLength: number
}

/**
 * 'solved'      — an optimal solution was found.
 * 'unsolvable'  — the search provably exhausted all reachable states (or the start
 *                 is an immediate deadlock); no solution exists.
 * 'capped'      — the expansion budget ran out before proving either; the result is
 *                 inconclusive (NOT a proof of unsolvability).
 */
export type SokobanStatus = 'solved' | 'unsolvable' | 'capped'

export interface SokobanSolution {
  /** Convenience: true iff `status === 'solved'`. */
  solved: boolean
  status: SokobanStatus
  pushes: Push[]
  /** Full player move sequence as LURD characters (lower-case = walk, upper-case = push). */
  moves: string
  stats: SokobanSolveStats
}

export interface SokobanGrade {
  score: number
  difficulty: Difficulty
}

export interface SokobanPuzzle {
  level: SokobanLevel
  seed: string
  difficulty: Difficulty
  score: number
  /** Optimal (fewest pushes) solution found by the oracle, for hints. */
  solution: SokobanSolution
}

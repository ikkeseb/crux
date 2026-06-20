import type { Difficulty } from '../lib/types'
import type { Technique } from './techniques'

/** A 9×9 grid. 0 means empty; 1–9 are placed digits. */
export type SudokuGrid = number[][]

export interface SudokuSolveResult {
  /** Solutions found, capped by the requested limit. */
  count: number
  /** First solution as a full grid, or null if none. */
  solution: SudokuGrid | null
  /** DLX recursion steps — a search-effort metric. */
  nodes: number
}

export interface SudokuLogicResult {
  solved: boolean
  nakedSingles: number
  hiddenSingles: number
  /** Cells still empty when logic stalled. */
  remaining: number
  grid: SudokuGrid
}

export interface SudokuGrade {
  score: number
  difficulty: Difficulty
  givens: number
  nodes: number
  /** Solvable by naked + hidden singles alone. */
  logicSolvable: boolean
  /** Hardest human technique the board forces, or null if singles never ran. */
  hardest: Technique | null
}

export interface SudokuPuzzle {
  /** The puzzle as presented (with blanks). */
  grid: SudokuGrid
  /** The unique solution. */
  solution: SudokuGrid
  givens: number
  seed: string
  difficulty: Difficulty
  score: number
}

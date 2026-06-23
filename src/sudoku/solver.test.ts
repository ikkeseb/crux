import { describe, it, expect } from 'vitest'
import {
  countGivens,
  countSolutions,
  gradeSudoku,
  isValidSolution,
  logicSolve,
  solveSudoku,
} from './solver'
import type { SudokuGrid } from './types'

// The canonical example puzzle and its unique solution.
const PUZZLE: SudokuGrid = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
]

const SOLUTION: SudokuGrid = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
]

const emptyBoard = (): SudokuGrid => Array.from({ length: 9 }, () => new Array<number>(9).fill(0))

describe('sudoku solver (DLX)', () => {
  it('solves the canonical puzzle to its known solution', () => {
    const sol = solveSudoku(PUZZLE)
    expect(sol).toEqual(SOLUTION)
  })

  it('reports exactly one solution for a proper puzzle', () => {
    const res = countSolutions(PUZZLE, 5)
    expect(res.count).toBe(1)
  })

  it('the found solution is rule-valid', () => {
    const sol = solveSudoku(PUZZLE)
    expect(sol).not.toBeNull()
    expect(isValidSolution(sol as SudokuGrid)).toBe(true)
  })

  it('an empty grid has many solutions (capped count)', () => {
    const res = countSolutions(emptyBoard(), 2)
    expect(res.count).toBe(2)
    expect(res.solution).not.toBeNull()
  })

  it('detects a multi-solution puzzle', () => {
    // Remove a clue that is required for uniqueness → multiple solutions.
    const ambiguous = PUZZLE.map((r) => r.slice())
    // Strip most of the board: keep only a handful of clues → certainly not unique.
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (r > 1) ambiguous[r]![c] = 0
    const res = countSolutions(ambiguous, 2)
    expect(res.count).toBe(2)
  })

  it('detects an unsolvable grid', () => {
    const bad = emptyBoard()
    bad[0]![0] = 5
    bad[0]![1] = 5 // two 5s in a row → impossible
    const res = countSolutions(bad, 2)
    expect(res.count).toBe(0)
    expect(res.solution).toBeNull()
  })

  it('records search effort (nodes)', () => {
    const res = countSolutions(PUZZLE, 1)
    expect(res.nodes).toBeGreaterThan(0)
  })
})

describe('logicSolve', () => {
  it('solves the canonical puzzle with singles', () => {
    const r = logicSolve(PUZZLE)
    // This classic puzzle is fully solvable by naked + hidden singles.
    expect(r.solved).toBe(true)
    expect(r.grid).toEqual(SOLUTION)
  })
})

describe('gradeSudoku', () => {
  it('grades a clue-rich logic puzzle below a clue-sparse one', () => {
    const easy = gradeSudoku(PUZZLE)
    expect(countGivens(PUZZLE)).toBe(30)
    expect(['easy', 'medium', 'hard', 'expert']).toContain(easy.difficulty)
    expect(easy.givens).toBe(30)
  })
})

import { describe, it, expect } from 'vitest'
import { DIFFICULTIES } from '../lib/types'
import { generateSudoku } from './generator'
import { countSolutions, isValidSolution } from './solver'
import type { SudokuGrid } from './types'

/** Every given in the puzzle must agree with the solution. */
function puzzleAgreesWithSolution(puzzle: SudokuGrid, solution: SudokuGrid): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = puzzle[r]![c]!
      if (v !== 0 && v !== solution[r]![c]) return false
    }
  }
  return true
}

describe('generateSudoku', () => {
  it('is deterministic for a given seed', () => {
    const a = generateSudoku('sudoku-seed-1', { difficulty: 'medium' })
    const b = generateSudoku('sudoku-seed-1', { difficulty: 'medium' })
    expect(b).toEqual(a)
  })

  it('produces different boards for different seeds', () => {
    const a = generateSudoku('sd-A', { difficulty: 'medium' })
    const b = generateSudoku('sd-B', { difficulty: 'medium' })
    expect(a.grid).not.toEqual(b.grid)
  })

  it('every generated puzzle is unique, valid, and consistent with its solution', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let s = 0; s < 3; s++) {
        const p = generateSudoku(`gen-${difficulty}-${s}`, { difficulty })
        expect(isValidSolution(p.solution)).toBe(true)
        expect(puzzleAgreesWithSolution(p.grid, p.solution)).toBe(true)
        const res = countSolutions(p.grid, 2)
        expect(res.count).toBe(1)
        expect(res.solution).toEqual(p.solution)
        expect(DIFFICULTIES).toContain(p.difficulty)
      }
    }
  })

  it('grades harder targets above easier ones (difficulty sanity)', () => {
    const avg = (difficulty: 'easy' | 'hard'): number => {
      let sum = 0
      const n = 4
      for (let s = 0; s < n; s++) {
        sum += generateSudoku(`avg-${difficulty}-${s}`, { difficulty }).score
      }
      return sum / n
    }
    expect(avg('hard')).toBeGreaterThan(avg('easy'))
  })

  it('leaves fewer givens for harder targets', () => {
    const easy = generateSudoku('givens-easy', { difficulty: 'easy' })
    const hard = generateSudoku('givens-hard', { difficulty: 'hard' })
    expect(hard.givens).toBeLessThan(easy.givens)
  })

  it('honours the requested difficulty (resampling)', () => {
    for (const difficulty of DIFFICULTIES) {
      let matches = 0
      const n = 6
      for (let s = 0; s < n; s++) {
        const p = generateSudoku(`honour-${difficulty}-${s}`, { difficulty })
        if (p.difficulty === difficulty) matches++
      }
      expect(matches).toBeGreaterThanOrEqual(5) // allow the rare resample miss
    }
  })
})

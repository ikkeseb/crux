import { describe, it, expect } from 'vitest'
import { DIFFICULTIES } from '../lib/types'
import { generateSlitherlink } from './generator'
import { cluesFromLoop, isSingleLoop, loopSatisfiesClues, solveSlitherlink } from './solver'
import type { SlitherlinkPuzzle } from './types'

function eachClue(
  p: SlitherlinkPuzzle,
  fn: (k: number | null, r: number, c: number) => void,
): void {
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) fn(p.clues[r]![c]!, r, c)
}

describe('generateSlitherlink', () => {
  it('is deterministic for a given seed', () => {
    const a = generateSlitherlink('slither-seed-1', { difficulty: 'medium' })
    const b = generateSlitherlink('slither-seed-1', { difficulty: 'medium' })
    expect(b).toEqual(a)
  })

  it('produces different boards for different seeds', () => {
    const a = generateSlitherlink('sl-A', { difficulty: 'medium' })
    const b = generateSlitherlink('sl-B', { difficulty: 'medium' })
    expect(a.clues).not.toEqual(b.clues)
  })

  it('every generated puzzle is a unique, valid, single-loop slitherlink', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let s = 0; s < 3; s++) {
        const p = generateSlitherlink(`gen-${difficulty}-${s}`, { difficulty })

        // The solution is one clean closed loop.
        expect(isSingleLoop(p.solution, p.rows, p.cols)).toBe(true)

        // Clues are 0–3 or blank, and every non-null clue agrees with the solution.
        const derived = cluesFromLoop(p.solution, p.rows, p.cols)
        eachClue(p, (k, r, c) => {
          if (k !== null) {
            expect(k).toBeGreaterThanOrEqual(0)
            expect(k).toBeLessThanOrEqual(3)
            expect(k).toBe(derived[r]![c])
          }
        })
        expect(loopSatisfiesClues(p.solution, p.clues)).toBe(true)

        // The presented clues admit exactly one solution: the stored loop.
        const res = solveSlitherlink(p.rows, p.cols, p.clues, 2)
        expect(res.status).toBe('unique')
        expect(res.loop).toEqual(p.solution)

        expect(DIFFICULTIES).toContain(p.difficulty)
      }
    }
  })

  it('produces a valid unique board for every small size, clues always 0–3 or null', () => {
    const sizes = [
      { rows: 2, cols: 2 },
      { rows: 2, cols: 3 },
      { rows: 3, cols: 2 },
      { rows: 3, cols: 3 },
      { rows: 4, cols: 5 },
      { rows: 7, cols: 7 },
    ]
    for (const size of sizes) {
      const p = generateSlitherlink(`size-${size.rows}x${size.cols}`, { size })
      expect(isSingleLoop(p.solution, p.rows, p.cols)).toBe(true)
      for (const row of p.clues)
        for (const k of row)
          if (k !== null) {
            expect(k).toBeGreaterThanOrEqual(0)
            expect(k).toBeLessThanOrEqual(3)
          }
      const res = solveSlitherlink(p.rows, p.cols, p.clues, 2)
      expect(res.status).toBe('unique')
      expect(res.loop).toEqual(p.solution)
    }
  })

  it('grades harder targets above easier ones (difficulty sanity)', () => {
    const avg = (difficulty: 'easy' | 'hard'): number => {
      let sum = 0
      const n = 4
      for (let s = 0; s < n; s++)
        sum += generateSlitherlink(`avg-${difficulty}-${s}`, { difficulty }).score
      return sum / n
    }
    expect(avg('hard')).toBeGreaterThan(avg('easy'))
  })

  it('honours the requested difficulty (resampling)', () => {
    for (const difficulty of DIFFICULTIES) {
      let matches = 0
      const n = 6
      for (let s = 0; s < n; s++) {
        const p = generateSlitherlink(`honour-${difficulty}-${s}`, { difficulty })
        if (p.difficulty === difficulty) matches++
      }
      expect(matches).toBeGreaterThanOrEqual(4) // allow the occasional resample miss
    }
  })
})

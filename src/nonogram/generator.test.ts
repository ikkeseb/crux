import { describe, it, expect } from 'vitest'
import { DIFFICULTIES, type Difficulty } from '../lib/types'
import { generateNonogram, NONOGRAM_PRESETS } from './generator'
import { gridMatchesClues, solve } from './solver'

describe('generateNonogram', () => {
  it('is deterministic for a given seed', () => {
    const a = generateNonogram('crux-seed-1', { width: 7, height: 7 })
    const b = generateNonogram('crux-seed-1', { width: 7, height: 7 })
    expect(b).toEqual(a)
  })

  it('produces different boards for different seeds', () => {
    const a = generateNonogram('seed-A', { width: 7, height: 7 })
    const b = generateNonogram('seed-B', { width: 7, height: 7 })
    expect(a.solution).not.toEqual(b.solution)
  })

  it('every generated board is uniquely solvable and matches its solution', () => {
    const sizes = [
      { width: 5, height: 5 },
      { width: 7, height: 7 },
      { width: 9, height: 9 },
    ]
    for (const size of sizes) {
      for (let s = 0; s < 6; s++) {
        const puzzle = generateNonogram(`prop-${size.width}-${s}`, size)
        const res = solve(puzzle.width, puzzle.height, puzzle.clues, { solutionCap: 2 })
        expect(res.status).toBe('unique')
        expect(gridMatchesClues(puzzle.solution, puzzle.clues)).toBe(true)
        expect(res.grid).toEqual(puzzle.solution)
        expect(DIFFICULTIES).toContain(puzzle.difficulty)
      }
    }
  })

  it('grades larger boards harder on average (difficulty sanity)', () => {
    const avg = (w: number, h: number): number => {
      let sum = 0
      const n = 6
      for (let s = 0; s < n; s++) {
        sum += generateNonogram(`grade-${w}-${s}`, { width: w, height: h }).score
      }
      return sum / n
    }
    const small = avg(5, 5)
    const large = avg(10, 10)
    expect(large).toBeGreaterThan(small)
  })

  it('size presets land in the expected difficulty tier', () => {
    const allowed: Record<Difficulty, Difficulty[]> = {
      easy: ['easy'],
      medium: ['medium'],
      hard: ['hard', 'expert'],
      expert: ['hard', 'expert'],
    }
    for (const difficulty of DIFFICULTIES) {
      const size = NONOGRAM_PRESETS[difficulty]
      for (let s = 0; s < 4; s++) {
        const p = generateNonogram(`preset-${difficulty}-${s}`, size)
        expect(allowed[difficulty]).toContain(p.difficulty)
      }
    }
  })

  it('does not throw on degenerate tiny sizes', () => {
    expect(() => generateNonogram('tiny-1', { width: 1, height: 1 })).not.toThrow()
    expect(() => generateNonogram('tiny-2', { width: 2, height: 3 })).not.toThrow()
  })
})

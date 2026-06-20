import { describe, it, expect } from 'vitest'
import { DIFFICULTIES } from '../lib/types'
import { generateSudoku } from './generator'
import {
  findHiddenSingle,
  findHiddenSubset,
  findLockedCandidates,
  findNakedSingle,
  findNakedSubset,
  findXWing,
  findXyWing,
  makeState,
  solveByTechniques,
  type State,
} from './techniques'
import type { SudokuGrid } from './types'

const bit = (d: number): number => 1 << d
const mask = (...ds: number[]): number => ds.reduce((m, d) => m | bit(d), 0)

/** A blank slate: every cell empty with no candidates, so only cells we arm fire. */
function blankState(): State {
  return {
    grid: Array.from({ length: 9 }, () => new Array<number>(9).fill(0)),
    cand: Array.from({ length: 9 }, () => new Array<number>(9).fill(0)),
  }
}

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

describe('technique: naked single', () => {
  it('places the only candidate in a cell', () => {
    const s = blankState()
    s.cand[4][4] = mask(7)
    const step = findNakedSingle(s)
    expect(step?.technique).toBe('naked-single')
    expect(step?.placements).toEqual([{ r: 4, c: 4, d: 7 }])
  })
})

describe('technique: hidden single', () => {
  it('places a digit with a single home in a unit', () => {
    const s = blankState()
    // In row 0, digit 9 is a candidate only at (0,0); 5 sits in several cells.
    s.cand[0][0] = mask(5, 9)
    s.cand[0][1] = mask(5, 7)
    s.cand[0][2] = mask(5, 7)
    const step = findHiddenSingle(s)
    expect(step?.technique).toBe('hidden-single')
    expect(step?.placements).toEqual([{ r: 0, c: 0, d: 9 }])
  })
})

describe('technique: locked candidates', () => {
  it('pointing: a digit boxed into one row eliminates it from the rest of the row', () => {
    const s = blankState()
    // In box 0, digit 5 lives only in row 0 → remove 5 from row 0 outside box 0.
    s.cand[0][0] = mask(5)
    s.cand[0][1] = mask(5)
    s.cand[0][5] = mask(5, 7)
    const step = findLockedCandidates(s)
    expect(step?.technique).toBe('locked-candidates')
    expect(step?.eliminations).toContainEqual({ r: 0, c: 5, d: 5 })
  })
})

describe('technique: naked pair', () => {
  it('removes the pair digits from the rest of the unit', () => {
    const s = blankState()
    s.cand[0][0] = mask(1, 2)
    s.cand[0][1] = mask(1, 2)
    s.cand[0][2] = mask(1, 3)
    const step = findNakedSubset(s, 2)
    expect(step?.technique).toBe('naked-pair')
    expect(step?.eliminations).toContainEqual({ r: 0, c: 2, d: 1 })
  })
})

describe('technique: hidden pair', () => {
  it('strips foreign candidates from the two cells that own the pair', () => {
    const s = blankState()
    s.cand[0][0] = mask(1, 2, 7)
    s.cand[0][1] = mask(1, 2, 8)
    s.cand[0][2] = mask(7, 8)
    const step = findHiddenSubset(s, 2)
    expect(step?.technique).toBe('hidden-pair')
    expect(step?.eliminations).toContainEqual({ r: 0, c: 0, d: 7 })
    expect(step?.eliminations).toContainEqual({ r: 0, c: 1, d: 8 })
  })
})

describe('technique: X-wing', () => {
  it('eliminates along the cross-lines of a two-by-two rectangle', () => {
    const s = blankState()
    // Digit 4 sits in exactly cols {2,6} on rows 0 and 4 → remove 4 from cols 2,6 elsewhere.
    s.cand[0][2] = mask(4, 1)
    s.cand[0][6] = mask(4, 1)
    s.cand[4][2] = mask(4, 1)
    s.cand[4][6] = mask(4, 1)
    s.cand[8][2] = mask(4, 5)
    const step = findXWing(s)
    expect(step?.technique).toBe('x-wing')
    expect(step?.eliminations).toContainEqual({ r: 8, c: 2, d: 4 })
  })
})

describe('technique: XY-wing', () => {
  it('removes the shared digit from a cell seeing both pincers', () => {
    const s = blankState()
    s.cand[0][0] = mask(1, 2) // pivot {x=1, y=2}
    s.cand[0][1] = mask(1, 3) // pincer {x=1, z=3}
    s.cand[1][0] = mask(2, 3) // pincer {y=2, z=3}
    s.cand[1][1] = mask(3, 4) // sees both pincers → 3 dies here
    const step = findXyWing(s)
    expect(step?.technique).toBe('xy-wing')
    expect(step?.eliminations).toContainEqual({ r: 1, c: 1, d: 3 })
  })
})

describe('solveByTechniques', () => {
  it('solves the canonical puzzle using only singles', () => {
    const res = solveByTechniques(PUZZLE)
    expect(res.solved).toBe(true)
    expect(res.grid).toEqual(SOLUTION)
    expect(res.hardest === 'naked-single' || res.hardest === 'hidden-single').toBe(true)
  })

  it('makeState computes a sane candidate set for an empty cell', () => {
    const s = makeState(PUZZLE)
    // (0,2) is empty; its row/col/box already use 5,3,7,9,8,6,1 etc.
    expect(s.cand[0][2]).toBeGreaterThan(0)
    expect(s.cand[0][0]).toBe(0) // a given cell carries no candidates
  })
})

describe('solver-as-oracle: every deduction agrees with the DLX solution', () => {
  it('never places a wrong digit or eliminates a true candidate', () => {
    const puzzles: SudokuGrid[] = []
    const solutions: SudokuGrid[] = []
    // A broad sample: cheap no-difficulty draws plus a few of each graded tier.
    for (let s = 0; s < 24; s++) {
      const p = generateSudoku(`oracle-${s}`)
      puzzles.push(p.grid)
      solutions.push(p.solution)
    }
    for (const difficulty of DIFFICULTIES) {
      for (let s = 0; s < 3; s++) {
        const p = generateSudoku(`oracle-${difficulty}-${s}`, { difficulty })
        puzzles.push(p.grid)
        solutions.push(p.solution)
      }
    }

    for (let i = 0; i < puzzles.length; i++) {
      const sol = solutions[i]
      const res = solveByTechniques(puzzles[i])
      for (const step of res.steps) {
        for (const p of step.placements) {
          expect(p.d).toBe(sol[p.r][p.c]) // a placement must be the true digit
        }
        for (const e of step.eliminations) {
          expect(e.d).not.toBe(sol[e.r][e.c]) // never remove the true candidate
        }
      }
      if (res.solved) expect(res.grid).toEqual(sol) // a full technique solve must match
    }
  })
})

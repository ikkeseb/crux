import { describe, it, expect } from 'vitest'
import { EMPTY, FILLED, UNKNOWN } from './types'
import {
  cluesFromGrid,
  gradeNonogram,
  gridMatchesClues,
  runsOf,
  solve,
  solveLine,
} from './solver'

const U = UNKNOWN
const F = FILLED
const E = EMPTY

describe('solveLine', () => {
  it('fills a fully-determined line', () => {
    const line = [U, U, U, U, U]
    const r = solveLine(line, [5])
    expect(r.contradiction).toBe(false)
    expect(line).toEqual([F, F, F, F, F])
  })

  it('empties a line with no blocks', () => {
    const line = [U, U, U, U]
    solveLine(line, [])
    expect(line).toEqual([E, E, E, E])
    const line2 = [U, U, U]
    solveLine(line2, [0]) // [0] is equivalent to []
    expect(line2).toEqual([E, E, E])
  })

  it('deduces the forced overlap of a large block', () => {
    const line = new Array<number>(10).fill(U)
    solveLine(line, [8])
    // leftmost covers 0..7, rightmost 2..9 → cells 2..7 forced filled.
    expect(line).toEqual([U, U, F, F, F, F, F, F, U, U])
  })

  it('forces the single overlap cell of a length-3 block in 5', () => {
    const line: number[] = [U, U, U, U, U]
    solveLine(line, [3])
    expect(line[2]).toBe(F)
    expect(line.filter((c) => c === F).length).toBe(1)
  })

  it('makes no deduction when none is forced', () => {
    const line = [U, U, U, U, U]
    const r = solveLine(line, [2])
    expect(r.contradiction).toBe(false)
    expect(r.changed).toBe(false)
    expect(line).toEqual([U, U, U, U, U])
  })

  it('completes a partial line around a known cell', () => {
    const line = [F, U, U]
    solveLine(line, [1])
    expect(line).toEqual([F, E, E])
  })

  it('detects an impossible line', () => {
    const line = [U, U]
    const r = solveLine(line, [3])
    expect(r.contradiction).toBe(true)
  })

  it('handles multiple blocks with gaps', () => {
    const line = new Array<number>(7).fill(U)
    solveLine(line, [2, 2, 1]) // 2+1+2+1+1 = 7 → exactly fits, fully determined
    expect(line).toEqual([F, F, E, F, F, E, F])
  })
})

describe('runsOf / cluesFromGrid', () => {
  it('computes run lengths', () => {
    expect(runsOf([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([2, 1, 3])
    expect(runsOf([0, 0, 0])).toEqual([])
    expect(runsOf([1, 1, 1])).toEqual([3])
  })

  it('derives row and column clues', () => {
    const grid = [
      [1, 0, 1],
      [1, 1, 0],
      [0, 0, 1],
    ]
    const clues = cluesFromGrid(grid)
    expect(clues.rows).toEqual([[1, 1], [2], [1]])
    expect(clues.cols).toEqual([[2], [1], [1, 1]])
  })
})

describe('solve', () => {
  it('solves a trivially unique board (all filled)', () => {
    const clues = { rows: [[2], [2]], cols: [[2], [2]] }
    const res = solve(2, 2, clues)
    expect(res.status).toBe('unique')
    expect(res.grid).toEqual([
      [1, 1],
      [1, 1],
    ])
    expect(res.stats.usedBacktracking).toBe(false)
  })

  it('solves a small unique board by logic alone', () => {
    // single filled corner
    const clues = { rows: [[1], []], cols: [[1], []] }
    const res = solve(2, 2, clues)
    expect(res.status).toBe('unique')
    expect(res.grid).toEqual([
      [1, 0],
      [0, 0],
    ])
    expect(res.stats.usedBacktracking).toBe(false)
  })

  it('detects a non-unique board', () => {
    // rows [1],[1] cols [1],[1] → two diagonal solutions
    const clues = { rows: [[1], [1]], cols: [[1], [1]] }
    const res = solve(2, 2, clues)
    expect(res.status).toBe('multiple')
    expect(res.solutionCount).toBe(2)
  })

  it('detects an unsatisfiable board', () => {
    // both rows full but each column should have a single cell — contradiction
    const clues = { rows: [[2], [2]], cols: [[1], [1]] }
    const res = solve(2, 2, clues)
    expect(res.status).toBe('none')
    expect(res.grid).toBeNull()
  })

  it('round-trips a designed solution through its clues', () => {
    const solution = [
      [0, 1, 1, 1, 0],
      [1, 1, 0, 1, 1],
      [1, 0, 1, 0, 1],
      [1, 1, 0, 1, 1],
      [0, 1, 1, 1, 0],
    ]
    const clues = cluesFromGrid(solution)
    const res = solve(5, 5, clues, { solutionCap: 2 })
    // Whatever the count, the found grid must be a valid solution of the clues.
    expect(res.grid).not.toBeNull()
    expect(gridMatchesClues(res.grid as number[][], clues)).toBe(true)
  })
})

describe('gradeNonogram', () => {
  it('grades a logic-only board below one needing backtracking', () => {
    const easy = solve(2, 2, { rows: [[2], [2]], cols: [[2], [2]] })
    const ambiguous = solve(2, 2, { rows: [[1], [1]], cols: [[1], [1]] })
    expect(easy.stats.usedBacktracking).toBe(false)
    expect(ambiguous.stats.usedBacktracking).toBe(true)
    const ge = gradeNonogram(easy.stats, 4)
    const ga = gradeNonogram(ambiguous.stats, 4)
    expect(ga.score).toBeGreaterThan(ge.score)
    expect(ge.difficulty).toBe('easy')
  })

  it('scales with board area', () => {
    const stats = { propagationRounds: 4, lineSolves: 40, guesses: 0, maxDepth: 0, usedBacktracking: false }
    expect(gradeNonogram(stats, 25).score).toBeLessThan(gradeNonogram(stats, 225).score)
  })
})

describe('solver robustness (review fixes)', () => {
  it('clamps the solution cap to >= 2 so uniqueness is never mislabelled', () => {
    // A 2x2 with two diagonal solutions must report 'multiple' even if cap=1 is asked.
    const res = solve(2, 2, { rows: [[1], [1]], cols: [[1], [1]] }, { solutionCap: 1 })
    expect(res.status).toBe('multiple')
  })

  it('guards degenerate dimensions instead of crashing or false-uniquing', () => {
    expect(solve(0, 3, { rows: [[], [], []], cols: [] }).status).toBe('none')
    expect(solve(3, 0, { rows: [], cols: [[], [], []] }).status).toBe('none')
  })

  it('treats zero-length blocks anywhere as no block', () => {
    const a: number[] = [U, U, U, U, U]
    const b: number[] = [U, U, U, U, U]
    solveLine(a, [0, 3])
    solveLine(b, [3])
    expect(a).toEqual(b)
    expect(a[2]).toBe(F)
  })

  it('gridMatchesClues rejects grids with UNKNOWN cells (no false win)', () => {
    const solution = [
      [1, 0],
      [0, 0],
    ]
    const clues = cluesFromGrid(solution)
    expect(gridMatchesClues(solution, clues)).toBe(true)
    // Only the top-left cell filled, the rest never touched (UNKNOWN) → not a win.
    expect(gridMatchesClues([[F, U], [U, U]], clues)).toBe(false)
  })
})

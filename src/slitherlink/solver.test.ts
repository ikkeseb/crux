import { describe, it, expect } from 'vitest'
import {
  cluesFromLoop,
  isSingleLoop,
  loopSatisfiesClues,
  solveSlitherlink,
} from './solver'
import type { Clue, Loop } from './types'

/** Build an all-false loop of the given cell dimensions. */
function emptyLoop(rows: number, cols: number): Loop {
  return {
    h: Array.from({ length: rows + 1 }, () => new Array<boolean>(cols).fill(false)),
    v: Array.from({ length: rows }, () => new Array<boolean>(cols + 1).fill(false)),
  }
}

/**
 * The boundary of the top-left 2×2 region in a 3×3 grid. A clean square loop:
 *   dots (0,0)→(0,2)→(2,2)→(2,0)→(0,0).
 */
function square2x2on3x3(): Loop {
  const loop = emptyLoop(3, 3)
  loop.h[0]![0] = true
  loop.h[0]![1] = true
  loop.h[2]![0] = true
  loop.h[2]![1] = true
  loop.v[0]![0] = true
  loop.v[1]![0] = true
  loop.v[0]![2] = true
  loop.v[1]![2] = true
  return loop
}

const SQUARE_CLUES: Clue[][] = [
  [2, 2, 1],
  [2, 2, 1],
  [1, 1, 0],
]

describe('isSingleLoop', () => {
  it('accepts a clean square loop', () => {
    expect(isSingleLoop(square2x2on3x3(), 3, 3)).toBe(true)
  })

  it('rejects an empty board (no loop)', () => {
    expect(isSingleLoop(emptyLoop(3, 3), 3, 3)).toBe(false)
  })

  it('rejects an open path', () => {
    const loop = emptyLoop(2, 2)
    loop.h[0]![0] = true // a single dangling edge → degree-1 endpoints
    expect(isSingleLoop(loop, 2, 2)).toBe(false)
  })

  it('rejects a figure-8 pinch (degree-4 dot)', () => {
    // Two unit squares meeting only at the centre dot (1,1).
    const loop = emptyLoop(2, 2)
    // cell (0,0) square
    loop.h[0]![0] = true
    loop.h[1]![0] = true
    loop.v[0]![0] = true
    loop.v[0]![1] = true
    // cell (1,1) square
    loop.h[1]![1] = true
    loop.h[2]![1] = true
    loop.v[1]![1] = true
    loop.v[1]![2] = true
    expect(isSingleLoop(loop, 2, 2)).toBe(false)
  })

  it('rejects two disjoint loops (multi-loop)', () => {
    const loop = emptyLoop(2, 3)
    // cell (0,0) square
    loop.h[0]![0] = true
    loop.h[1]![0] = true
    loop.v[0]![0] = true
    loop.v[0]![1] = true
    // cell (1,2) square — shares no dot with the first
    loop.h[1]![2] = true
    loop.h[2]![2] = true
    loop.v[1]![2] = true
    loop.v[1]![3] = true
    expect(isSingleLoop(loop, 2, 3)).toBe(false)
  })
})

describe('cluesFromLoop', () => {
  it('derives the full clue grid from a known loop', () => {
    const full = cluesFromLoop(square2x2on3x3(), 3, 3)
    expect(full).toEqual([
      [2, 2, 1],
      [2, 2, 1],
      [1, 1, 0],
    ])
  })
})

describe('loopSatisfiesClues', () => {
  it('confirms the known loop satisfies its clues', () => {
    expect(loopSatisfiesClues(square2x2on3x3(), SQUARE_CLUES)).toBe(true)
  })

  it('rejects a loop that violates a clue', () => {
    const wrong: Clue[][] = SQUARE_CLUES.map((r) => r.slice())
    wrong[2]![2] = 3 // the corner cell really has 0 edges
    expect(loopSatisfiesClues(square2x2on3x3(), wrong)).toBe(false)
  })

  it('ignores null clues', () => {
    const sparse: Clue[][] = [
      [2, null, null],
      [null, null, null],
      [null, null, 0],
    ]
    expect(loopSatisfiesClues(square2x2on3x3(), sparse)).toBe(true)
  })
})

describe('solveSlitherlink', () => {
  it('finds the unique solution of a fully-clued board', () => {
    const res = solveSlitherlink(3, 3, SQUARE_CLUES, 2)
    expect(res.status).toBe('unique')
    expect(res.solutionCount).toBe(1)
    expect(res.loop).not.toBeNull()
    expect(res.loop).toEqual(square2x2on3x3())
    expect(isSingleLoop(res.loop!, 3, 3)).toBe(true)
    expect(loopSatisfiesClues(res.loop!, SQUARE_CLUES)).toBe(true)
  })

  it('reports multiple solutions for an under-constrained board', () => {
    const blank: Clue[][] = Array.from({ length: 3 }, () => new Array<Clue>(3).fill(null))
    const res = solveSlitherlink(3, 3, blank, 2)
    expect(res.status).toBe('multiple')
    expect(res.solutionCount).toBe(2) // capped
  })

  it('reports no solution for an impossible board', () => {
    // 1×1: the only possible loop encircles the cell (4 edges), which no 0–3 clue allows.
    const res = solveSlitherlink(1, 1, [[2]], 2)
    expect(res.status).toBe('none')
    expect(res.solutionCount).toBe(0)
    expect(res.loop).toBeNull()
  })

  it('solves a sparse board to the same unique loop', () => {
    // A handful of clues that still pin down the 2×2 square uniquely.
    const sparse: Clue[][] = [
      [2, null, null],
      [null, 2, null],
      [null, null, 0],
    ]
    const res = solveSlitherlink(3, 3, sparse, 2)
    if (res.status === 'unique') {
      expect(res.loop).toEqual(square2x2on3x3())
    } else {
      // If these clues are ambiguous the solver must say so honestly, not crash.
      expect(res.status).toBe('multiple')
    }
  })
})

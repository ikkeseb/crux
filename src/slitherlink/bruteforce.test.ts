import { describe, it, expect } from 'vitest'
import { solveSlitherlink } from './solver'
import type { Clue } from './types'

/**
 * Independent oracle: brute-force every edge subset of a small board and count the
 * genuinely valid single-loop solutions (capped at 2), using validity logic written
 * fresh here — no shared code with the solver under test. The solver's count and
 * status must agree on every board. This pins down both soundness (never count an
 * invalid config) and completeness (never miss a real second solution → false
 * 'unique', which would silently break the generator's uniqueness guarantee).
 */

interface Assignment {
  h: boolean[][]
  v: boolean[][]
}

/** Fresh, self-contained validity check: exactly one closed loop honouring all clues. */
function isValidSolution(a: Assignment, clues: Clue[][], rows: number, cols: number): boolean {
  // 1) clues
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = clues[r]![c]
      if (k == null) continue
      let n = 0
      if (a.h[r]![c]) n++
      if (a.h[r + 1]![c]) n++
      if (a.v[r]![c]) n++
      if (a.v[r]![c + 1]) n++
      if (n !== k) return false
    }
  }
  // 2) build dot adjacency from line edges; collect degree
  const id = (dr: number, dc: number): number => dr * (cols + 1) + dc
  const adj = new Map<number, number[]>()
  const deg = new Map<number, number>()
  const link = (x: number, y: number): void => {
    if (!adj.has(x)) adj.set(x, [])
    if (!adj.has(y)) adj.set(y, [])
    adj.get(x)!.push(y)
    adj.get(y)!.push(x)
    deg.set(x, (deg.get(x) ?? 0) + 1)
    deg.set(y, (deg.get(y) ?? 0) + 1)
  }
  let edges = 0
  for (let dr = 0; dr <= rows; dr++)
    for (let c = 0; c < cols; c++)
      if (a.h[dr]![c]) {
        edges++
        link(id(dr, c), id(dr, c + 1))
      }
  for (let r = 0; r < rows; r++)
    for (let dc = 0; dc <= cols; dc++)
      if (a.v[r]![dc]) {
        edges++
        link(id(r, dc), id(r + 1, dc))
      }
  if (edges === 0) return false
  // every touched dot must have degree exactly 2
  for (const d of deg.values()) if (d !== 2) return false
  // the line edges must form ONE connected component (BFS from any touched dot)
  const start = adj.keys().next().value as number
  const seen = new Set<number>([start])
  const stack = [start]
  while (stack.length) {
    const x = stack.pop()!
    for (const y of adj.get(x)!) if (!seen.has(y)) {
      seen.add(y)
      stack.push(y)
    }
  }
  return seen.size === deg.size
}

/** Count valid single-loop solutions of `clues` by brute force, capped at 2. */
function bruteCount(clues: Clue[][], rows: number, cols: number): number {
  const hEdges: Array<[number, number]> = []
  for (let dr = 0; dr <= rows; dr++) for (let c = 0; c < cols; c++) hEdges.push([dr, c])
  const vEdges: Array<[number, number]> = []
  for (let r = 0; r < rows; r++) for (let dc = 0; dc <= cols; dc++) vEdges.push([r, dc])
  const total = hEdges.length + vEdges.length

  let count = 0
  for (let mask = 0; mask < 1 << total; mask++) {
    const h = Array.from({ length: rows + 1 }, () => new Array<boolean>(cols).fill(false))
    const v = Array.from({ length: rows }, () => new Array<boolean>(cols + 1).fill(false))
    for (let i = 0; i < hEdges.length; i++) {
      if (mask & (1 << i)) {
        const [dr, c] = hEdges[i]!
        h[dr]![c] = true
      }
    }
    for (let j = 0; j < vEdges.length; j++) {
      if (mask & (1 << (hEdges.length + j))) {
        const [r, dc] = vEdges[j]!
        v[r]![dc] = true
      }
    }
    if (isValidSolution({ h, v }, clues, rows, cols)) {
      count++
      if (count >= 2) return 2
    }
  }
  return count
}

function statusOf(count: number): string {
  return count === 0 ? 'none' : count === 1 ? 'unique' : 'multiple'
}

describe('solver agrees with brute force', () => {
  it('matches on every 2×2 clue grid (exhaustive)', () => {
    // 4 cells × {0,1,2,3,null} = 625 boards, 12 edges each (2^12 subsets).
    const opts: Clue[] = [0, 1, 2, 3, null]
    for (const a of opts)
      for (const b of opts)
        for (const c of opts)
          for (const d of opts) {
            const clues: Clue[][] = [
              [a, b],
              [c, d],
            ]
            const brute = bruteCount(clues, 2, 2)
            const res = solveSlitherlink(2, 2, clues, 2)
            expect(res.solutionCount, JSON.stringify(clues)).toBe(brute)
            expect(res.status, JSON.stringify(clues)).toBe(statusOf(brute))
          }
  })

  it('matches on sampled 2×3 boards', () => {
    // 2×3 has 17 edges (2^17 subsets) — feasible per board, so sample clue grids.
    const opts: Clue[] = [0, 1, 2, 3, null]
    let seed = 123456789
    const rnd = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
      return seed
    }
    for (let t = 0; t < 24; t++) {
      const clues: Clue[][] = [
        [opts[rnd() % 5]!, opts[rnd() % 5]!, opts[rnd() % 5]!],
        [opts[rnd() % 5]!, opts[rnd() % 5]!, opts[rnd() % 5]!],
      ]
      const brute = bruteCount(clues, 2, 3)
      const res = solveSlitherlink(2, 3, clues, 2)
      expect(res.solutionCount, JSON.stringify(clues)).toBe(brute)
      expect(res.status, JSON.stringify(clues)).toBe(statusOf(brute))
    }
  })
})

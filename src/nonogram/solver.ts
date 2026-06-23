import type { Difficulty } from '../lib/types'
import {
  EMPTY,
  FILLED,
  UNKNOWN,
  type NonogramClues,
  type NonogramSolution,
  type NonogramSolveStats,
  type SolveStatus,
} from './types'

/* ------------------------------------------------------------------ *
 * Line solver
 *
 * The heart of the nonogram oracle. Given one line (row or column) with
 * its run-length clues and the cells decided so far, it deduces every
 * cell that is *forced* — filled in every valid completion, or empty in
 * every valid completion — and writes those deductions back into the
 * line. This is complete per-line reasoning: it finds all deductions a
 * perfect player could make from that single line, no guessing.
 *
 * Method: an O(n·m) reachability DP. `place(i,j)` answers "can cells
 * [i,n) be validly completed using clue-blocks [j,m)?" and a forward
 * pass `pre[i][j]` answers the mirror "can cells [0,i) be realised with
 * blocks [0,j), ending on a gap?". A cell is *possibly filled* iff some
 * block placement that participates in a full valid arrangement covers
 * it; *possibly empty* iff some full arrangement leaves it blank. A cell
 * that is possibly-one-but-not-the-other is forced.
 * ------------------------------------------------------------------ */

export interface LineResult {
  changed: boolean
  contradiction: boolean
}

/** Normalise clues by dropping zero-length blocks (`[]`, `[0]`, `[2,0,1]` → `[2,1]`). */
function blocksOf(clues: readonly number[]): number[] {
  return clues.filter((c) => c !== 0)
}

export function solveLine(line: number[], clues: readonly number[]): LineResult {
  const n = line.length
  const blocks = blocksOf(clues)
  const m = blocks.length

  const canFill = (i: number): boolean => line[i] !== EMPTY
  const canEmpty = (i: number): boolean => line[i] !== FILLED
  const allCanFill = (lo: number, hi: number): boolean => {
    for (let k = lo; k < hi; k++) if (!canFill(k)) return false
    return true
  }

  // place(i,j): can [i,n) be completed with blocks [j,m)?  (memoised)
  const W = m + 1
  const memo = new Int8Array((n + 1) * W).fill(-1)
  const place = (i: number, j: number): boolean => {
    const key = i * W + j
    const cached = memo[key]
    if (cached !== -1) return cached === 1
    let res = false
    if (j === m) {
      res = true
      for (let k = i; k < n; k++) {
        if (!canEmpty(k)) {
          res = false
          break
        }
      }
    } else {
      // Leave cell i empty.
      if (i < n && canEmpty(i) && place(i + 1, j)) res = true
      // Or start block j at cell i.
      if (!res) {
        const L = blocks[j] as number
        if (i + L <= n && allCanFill(i, i + L) && (i + L === n || canEmpty(i + L))) {
          const p = i + L === n ? n : i + L + 1
          if (place(p, j + 1)) res = true
        }
      }
    }
    memo[key] = res ? 1 : 0
    return res
  }

  if (!place(0, 0)) return { changed: false, contradiction: true }

  // Forward reachability: pre[i][j] = blocks [0,j) realised in [0,i), gap at i.
  const pre: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(W))
  pre[0]![0] = 1
  for (let i = 0; i <= n; i++) {
    const row = pre[i] as Uint8Array
    for (let j = 0; j <= m; j++) {
      if (!row[j]) continue
      if (i < n && canEmpty(i)) pre[i + 1]![j] = 1
      if (j < m) {
        const L = blocks[j] as number
        if (i + L <= n && allCanFill(i, i + L) && (i + L === n || canEmpty(i + L))) {
          if (i + L === n) pre[n]![j + 1] = 1
          else pre[i + L + 1]![j + 1] = 1
        }
      }
    }
  }

  // Mark per-cell possibilities across all full valid arrangements.
  const possFill = new Uint8Array(n)
  const possEmpty = new Uint8Array(n)
  for (let i = 0; i <= n; i++) {
    const row = pre[i] as Uint8Array
    for (let j = 0; j <= m; j++) {
      if (!row[j]) continue
      // Leaving cell i empty and completing the rest.
      if (i < n && canEmpty(i) && place(i + 1, j)) possEmpty[i] = 1
      if (j < m) {
        const L = blocks[j] as number
        if (i + L <= n && allCanFill(i, i + L) && (i + L === n || canEmpty(i + L))) {
          const p = i + L === n ? n : i + L + 1
          if (place(p, j + 1)) {
            for (let k = i; k < i + L; k++) possFill[k] = 1
            if (i + L < n) possEmpty[i + L] = 1
          }
        }
      }
    }
  }

  let changed = false
  for (let i = 0; i < n; i++) {
    if (line[i] !== UNKNOWN) continue
    const f = possFill[i]
    const e = possEmpty[i]
    if (f && !e) {
      line[i] = FILLED
      changed = true
    } else if (e && !f) {
      line[i] = EMPTY
      changed = true
    } else if (!f && !e) {
      // No arrangement covers this cell either way — impossible given place(0,0).
      return { changed, contradiction: true }
    }
  }
  return { changed, contradiction: false }
}

/* ------------------------------------------------------------------ *
 * Whole-grid propagation + backtracking
 * ------------------------------------------------------------------ */

function freshStats(): NonogramSolveStats {
  return {
    propagationRounds: 0,
    lineSolves: 0,
    guesses: 0,
    maxDepth: 0,
    usedBacktracking: false,
  }
}

/** Run line propagation to a fixpoint. Returns false on contradiction. */
function propagate(grid: number[][], clues: NonogramClues, stats: NonogramSolveStats): boolean {
  const h = grid.length
  const w = grid[0]!.length
  let changed = true
  while (changed) {
    changed = false
    stats.propagationRounds++
    for (let y = 0; y < h; y++) {
      const r = solveLine(grid[y]!, clues.rows[y]!)
      stats.lineSolves++
      if (r.contradiction) return false
      if (r.changed) changed = true
    }
    for (let x = 0; x < w; x++) {
      const col = new Array<number>(h)
      for (let y = 0; y < h; y++) col[y] = grid[y]![x]!
      const r = solveLine(col, clues.cols[x]!)
      stats.lineSolves++
      if (r.contradiction) return false
      if (r.changed) {
        changed = true
        for (let y = 0; y < h; y++) grid[y]![x] = col[y]!
      }
    }
  }
  return true
}

export interface SolveOptions {
  /** Stop after this many solutions are found (default 2 — enough for uniqueness). */
  solutionCap?: number
  /** Initial partial grid (UNKNOWN/EMPTY/FILLED); defaults to all-unknown. */
  initial?: number[][]
}

function makeGrid(w: number, h: number, fill: number): number[][] {
  return Array.from({ length: h }, () => new Array<number>(w).fill(fill))
}

/**
 * Solve a nonogram. Counts solutions up to `solutionCap` (so uniqueness can be
 * decided) and records how much work it took, which is what difficulty grading
 * is built on.
 */
export function solve(
  width: number,
  height: number,
  clues: NonogramClues,
  opts: SolveOptions = {},
): NonogramSolution {
  if (width <= 0 || height <= 0) {
    return { status: 'none', grid: null, solutionCount: 0, stats: freshStats() }
  }
  // 'unique' is only meaningful if the solver may find a second solution, so the
  // effective cap is always at least 2.
  const cap = Math.max(2, opts.solutionCap ?? 2)
  const stats = freshStats()
  const start: number[][] = opts.initial
    ? opts.initial.map((r) => r.slice())
    : makeGrid(width, height, UNKNOWN)

  let count = 0
  let first: number[][] | null = null

  const recurse = (g: number[][], depth: number): void => {
    if (count >= cap) return
    if (depth > stats.maxDepth) stats.maxDepth = depth
    if (!propagate(g, clues, stats)) return

    let uy = -1
    let ux = -1
    outer: for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (g[y]![x] === UNKNOWN) {
          uy = y
          ux = x
          break outer
        }
      }
    }

    if (uy === -1) {
      count++
      if (!first) first = g.map((r) => r.slice())
      return
    }

    stats.usedBacktracking = true
    stats.guesses++
    for (const val of [FILLED, EMPTY]) {
      if (count >= cap) break
      const g2 = g.map((r) => r.slice())
      g2[uy]![ux] = val
      recurse(g2, depth + 1)
    }
  }

  recurse(start, 0)

  const status: SolveStatus = count === 0 ? 'none' : count === 1 ? 'unique' : 'multiple'
  return { status, grid: first, solutionCount: count, stats }
}

/* ------------------------------------------------------------------ *
 * Clues, verification, difficulty
 * ------------------------------------------------------------------ */

/** Run lengths of consecutive filled cells in a single line. */
export function runsOf(line: readonly number[]): number[] {
  const runs: number[] = []
  let run = 0
  for (const c of line) {
    if (c === FILLED) run++
    else if (run > 0) {
      runs.push(run)
      run = 0
    }
  }
  if (run > 0) runs.push(run)
  return runs
}

/** Derive row/column clues from a fully-filled (0/1) solution grid. */
export function cluesFromGrid(grid: number[][]): NonogramClues {
  const h = grid.length
  const w = grid[0]!.length
  const rows = grid.map((r) => runsOf(r))
  const cols: number[][] = []
  for (let x = 0; x < w; x++) {
    const col = new Array<number>(h)
    for (let y = 0; y < h; y++) col[y] = grid[y]![x]!
    cols.push(runsOf(col))
  }
  return { rows, cols }
}

/** Does a fully-filled grid satisfy the clues? (Win check.) Any UNKNOWN cell fails. */
export function gridMatchesClues(grid: number[][], clues: NonogramClues): boolean {
  for (const row of grid) {
    for (const c of row) {
      if (c !== EMPTY && c !== FILLED) return false
    }
  }
  const derived = cluesFromGrid(grid)
  const eq = (a: number[][], b: number[][]): boolean =>
    a.length === b.length &&
    a.every((r, i) => r.length === b[i]!.length && r.every((v, j) => v === b[i]![j]))
  return eq(derived.rows, clues.rows as number[][]) && eq(derived.cols, clues.cols as number[][])
}

export interface NonogramGrade {
  score: number
  difficulty: Difficulty
}

/**
 * Grade difficulty by how hard the oracle worked, scaled by board size. Bigger
 * boards genuinely take more line-solving even when pure-logic, so area is part
 * of the score; any required guessing then dominates (a human experiences it as a
 * qualitative jump). `area` (width*height) lets size-based presets land in sane
 * tiers — pass it from the generator; it defaults to 0 for raw stat grading.
 */
export function gradeNonogram(stats: NonogramSolveStats, area = 0): NonogramGrade {
  let score = area * 0.12 + stats.propagationRounds * 0.5 + stats.lineSolves * 0.05
  if (stats.usedBacktracking) {
    score += 50 + stats.guesses * 12 + stats.maxDepth * 6
  }
  const difficulty: Difficulty =
    score < 11 ? 'easy' : score < 26 ? 'medium' : score < 46 ? 'hard' : 'expert'
  return { score: Math.round(score * 100) / 100, difficulty }
}

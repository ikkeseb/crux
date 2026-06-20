import type { Difficulty } from '../lib/types'
import { Dlx } from './dlx'
import type {
  SudokuGrade,
  SudokuGrid,
  SudokuLogicResult,
  SudokuSolveResult,
} from './types'

export const N = 9
const FULL_MASK = 0x3fe // bits 1..9 set

/* ---- exact-cover encoding ------------------------------------------------ */

const boxOf = (r: number, c: number): number =>
  Math.floor(r / 3) * 3 + Math.floor(c / 3)

const cellCol = (r: number, c: number): number => r * 9 + c
const rowCol = (r: number, d: number): number => 81 + r * 9 + (d - 1)
const colCol = (c: number, d: number): number => 162 + c * 9 + (d - 1)
const boxCol = (r: number, c: number, d: number): number =>
  243 + boxOf(r, c) * 9 + (d - 1)

const rowIdOf = (r: number, c: number, d: number): number => (r * 9 + c) * 9 + (d - 1)
const colsFor = (r: number, c: number, d: number): number[] => [
  cellCol(r, c),
  rowCol(r, d),
  colCol(c, d),
  boxCol(r, c, d),
]

export function cloneGrid(grid: SudokuGrid): SudokuGrid {
  return grid.map((row) => row.slice())
}

export function emptyGrid(): SudokuGrid {
  return Array.from({ length: N }, () => new Array<number>(N).fill(0))
}

/** Would placing digit `d` at (r,c) conflict with an existing entry? */
export function conflicts(grid: SudokuGrid, r: number, c: number, d: number): boolean {
  for (let k = 0; k < N; k++) {
    if (grid[r]![k] === d) return true
    if (grid[k]![c] === d) return true
  }
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[br + i]![bc + j] === d) return true
    }
  }
  return false
}

function gridFromRows(rows: number[]): SudokuGrid {
  const g = emptyGrid()
  for (const id of rows) {
    const d = (id % 9) + 1
    const t = Math.floor(id / 9)
    const c = t % 9
    const r = Math.floor(t / 9)
    g[r]![c] = d
  }
  return g
}

/**
 * Build the DLX for a (partial) grid. Givens become forced rows; empty cells get
 * a row per digit that doesn't already conflict with a given. If `digitOrder` is
 * supplied, empty-cell candidate rows are inserted in that order — used by the
 * generator to make the first solution found effectively random yet deterministic.
 */
function buildDlx(grid: SudokuGrid, digitOrder?: readonly number[]): Dlx {
  const dlx = new Dlx(324)
  const order = digitOrder ?? [1, 2, 3, 4, 5, 6, 7, 8, 9]
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = grid[r]![c]!
      if (v !== 0) {
        dlx.addRow(rowIdOf(r, c, v), colsFor(r, c, v))
      } else {
        for (const d of order) {
          if (!conflicts(grid, r, c, d)) dlx.addRow(rowIdOf(r, c, d), colsFor(r, c, d))
        }
      }
    }
  }
  return dlx
}

/** Count solutions up to `limit` and return the first one found. */
export function countSolutions(grid: SudokuGrid, limit = 2): SudokuSolveResult {
  const dlx = buildDlx(grid)
  const sols = dlx.search(limit)
  return {
    count: sols.length,
    solution: sols.length > 0 ? gridFromRows(sols[0]!) : null,
    nodes: dlx.nodeCount,
  }
}

/** The unique solution, or null if zero / multiple. */
export function solveSudoku(grid: SudokuGrid): SudokuGrid | null {
  const res = countSolutions(grid, 2)
  return res.count === 1 ? res.solution : null
}

/** Solve an empty grid into one random complete board (deterministic via `order` source). */
export function buildRandomFullGrid(nextDigitOrder: () => number[]): SudokuGrid {
  const dlx = new Dlx(324)
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      for (const d of nextDigitOrder()) {
        dlx.addRow(rowIdOf(r, c, d), colsFor(r, c, d))
      }
    }
  }
  const sols = dlx.search(1)
  if (sols.length === 0) throw new Error('failed to build a full sudoku grid')
  return gridFromRows(sols[0]!)
}

/* ---- validity ------------------------------------------------------------ */

function unitIsPermutation(values: number[]): boolean {
  if (values.length !== 9) return false
  const seen = new Set(values)
  if (seen.size !== 9) return false
  for (let d = 1; d <= 9; d++) if (!seen.has(d)) return false
  return true
}

/** Is `grid` a fully-filled, rule-valid solution? */
export function isValidSolution(grid: SudokuGrid): boolean {
  for (let r = 0; r < N; r++) {
    if (!unitIsPermutation(grid[r]!.slice())) return false
  }
  for (let c = 0; c < N; c++) {
    const col: number[] = []
    for (let r = 0; r < N; r++) col.push(grid[r]![c]!)
    if (!unitIsPermutation(col)) return false
  }
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3
    const bc = (b % 3) * 3
    const box: number[] = []
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box.push(grid[br + i]![bc + j]!)
    if (!unitIsPermutation(box)) return false
  }
  return true
}

/* ---- human-technique logic solver (for grading) ------------------------- */

const popcount = (x: number): number => {
  let n = 0
  let v = x
  while (v) {
    v &= v - 1
    n++
  }
  return n
}
const singleDigit = (mask: number): number => 31 - Math.clz32(mask)

function candidateMask(grid: SudokuGrid, r: number, c: number): number {
  let used = 0
  for (let k = 0; k < N; k++) {
    used |= 1 << grid[r]![k]!
    used |= 1 << grid[k]![c]!
  }
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) used |= 1 << grid[br + i]![bc + j]!
  }
  return FULL_MASK & ~used
}

function countEmpty(grid: SudokuGrid): number {
  let n = 0
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r]![c] === 0) n++
  return n
}

const unitCells = (() => {
  const units: Array<Array<[number, number]>> = []
  for (let r = 0; r < N; r++) units.push(Array.from({ length: N }, (_, c) => [r, c] as [number, number]))
  for (let c = 0; c < N; c++) units.push(Array.from({ length: N }, (_, r) => [r, c] as [number, number]))
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3
    const bc = (b % 3) * 3
    const cells: Array<[number, number]> = []
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([br + i, bc + j])
    units.push(cells)
  }
  return units
})()

/**
 * Solve as far as naked singles + hidden singles take it. Used only for grading:
 * a puzzle solvable this way is "easy/medium"; one that stalls needs real search.
 */
export function logicSolve(grid: SudokuGrid): SudokuLogicResult {
  const g = cloneGrid(grid)
  let nakedSingles = 0
  let hiddenSingles = 0

  for (;;) {
    let progress = false

    // Naked singles: a cell with exactly one candidate.
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (g[r]![c] !== 0) continue
        const m = candidateMask(g, r, c)
        if (m === 0) {
          return { solved: false, nakedSingles, hiddenSingles, remaining: countEmpty(g), grid: g }
        }
        if (popcount(m) === 1) {
          g[r]![c] = singleDigit(m)
          nakedSingles++
          progress = true
        }
      }
    }
    if (progress) continue

    // Hidden singles: a digit with exactly one home in some unit.
    for (const cells of unitCells) {
      for (let d = 1; d <= 9 && !progress; d++) {
        const bit = 1 << d
        let spot: [number, number] | null = null
        let already = false
        for (const [r, c] of cells) {
          if (g[r]![c] === d) {
            already = true
            break
          }
          if (g[r]![c] === 0 && (candidateMask(g, r, c) & bit) !== 0) {
            if (spot) {
              spot = null
              break
            }
            spot = [r, c]
          }
        }
        if (!already && spot) {
          g[spot[0]]![spot[1]] = d
          hiddenSingles++
          progress = true
        }
      }
      if (progress) break
    }

    if (!progress) break
  }

  const remaining = countEmpty(g)
  return { solved: remaining === 0, nakedSingles, hiddenSingles, remaining, grid: g }
}

/* ---- difficulty grading -------------------------------------------------- */

export function countGivens(grid: SudokuGrid): number {
  let n = 0
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r]![c] !== 0) n++
  return n
}

/**
 * Grade by how much work the oracle needs. Puzzles a perfect player can crack
 * with singles alone are easy/medium; those that force the solver into real
 * search are hard/expert, discriminated by DLX node count beyond the minimum.
 */
export function gradeSudoku(grid: SudokuGrid): SudokuGrade {
  const givens = countGivens(grid)
  const empties = 81 - givens
  const logic = logicSolve(grid)
  const search = countSolutions(grid, 2)
  const nodes = search.nodes

  // Two qualitative regimes: solvable by singles alone (easy/medium, split by how
  // empty the board is) vs. requiring real DLX search (hard/expert, split by how
  // much search beyond the minimum forced fill).
  let difficulty: Difficulty
  let score: number
  if (logic.solved) {
    difficulty = empties < 43 ? 'easy' : 'medium'
    score = empties + logic.hiddenSingles * 0.3
  } else {
    const extra = Math.max(0, nodes - empties)
    difficulty = extra < 60 ? 'hard' : 'expert'
    score = empties + 40 + extra * 0.5
  }

  return {
    score: Math.round(score * 100) / 100,
    difficulty,
    givens,
    nodes,
    logicSolvable: logic.solved,
  }
}

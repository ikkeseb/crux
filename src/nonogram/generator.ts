import type { Difficulty } from '../lib/types'
import { Rng } from '../lib/rng'
import { cluesFromGrid, gradeNonogram, solve } from './solver'
import type { NonogramPuzzle } from './types'

export interface NonogramGenOptions {
  width: number
  height: number
  /** Target graded difficulty; generator keeps the closest match it finds. */
  difficulty?: Difficulty
  /** Probability a cell is filled in the random solution (default 0.55). */
  density?: number
  /** Max random boards to try before returning best-effort (default 600). */
  maxAttempts?: number
}

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
  expert: 3,
}

/** A random 0/1 grid; filled cells appear with probability `density`. */
function randomGrid(rng: Rng, w: number, h: number, density: number): number[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => (rng.bool(density) ? 1 : 0)),
  )
}

function fillFraction(grid: number[][]): number {
  let filled = 0
  let total = 0
  for (const row of grid) {
    for (const c of row) {
      total++
      if (c === 1) filled++
    }
  }
  return total === 0 ? 0 : filled / total
}

/**
 * Generate a nonogram guaranteed to have a unique solution.
 *
 * Strategy: draw a random solution grid, derive its clues, and ask the solver
 * whether those clues admit exactly one solution. Reject non-unique (or
 * degenerate near-empty/near-full) boards and retry — all draws come from the
 * seeded RNG, so the whole process is deterministic. Difficulty is graded from
 * the solver's effort; if a target difficulty is given we keep retrying and
 * return the closest match found.
 */
export function generateNonogram(
  seed: string | number,
  opts: NonogramGenOptions,
): NonogramPuzzle {
  const { width, height } = opts
  const area = width * height
  const density = Math.min(0.9, Math.max(0.1, opts.density ?? 0.55))
  const maxAttempts = opts.maxAttempts ?? 600
  const rng = new Rng(seed)
  const seedStr = String(seed)

  // Reject trivially boring boards by fill ratio — but the window follows the
  // requested density, and tiny boards (where ratios are coarsely quantised)
  // skip the filter so a unique board is never discarded for its ratio alone.
  const applyFilter = area >= 16
  const lo = Math.max(0.1, density - 0.25)
  const hi = Math.min(0.9, density + 0.25)

  let best: NonogramPuzzle | null = null
  let bestDistance = Infinity

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = randomGrid(rng, width, height, density)

    if (applyFilter) {
      const frac = fillFraction(grid)
      if (frac < lo || frac > hi) continue
    }

    const clues = cluesFromGrid(grid)
    const res = solve(width, height, clues, { solutionCap: 2 })
    if (res.status !== 'unique') continue

    const grade = gradeNonogram(res.stats, area)
    const puzzle: NonogramPuzzle = {
      width,
      height,
      clues,
      solution: grid,
      seed: seedStr,
      difficulty: grade.difficulty,
      score: grade.score,
    }

    if (!opts.difficulty) return puzzle
    if (grade.difficulty === opts.difficulty) return puzzle

    const distance = Math.abs(
      DIFFICULTY_RANK[grade.difficulty] - DIFFICULTY_RANK[opts.difficulty],
    )
    if (distance < bestDistance) {
      bestDistance = distance
      best = puzzle // closest difficulty match / first unique found
    }
  }

  if (best) return best
  throw new Error(
    `nonogram generation failed for ${width}x${height} (seed ${seedStr}); try a different size or density`,
  )
}

/** Size presets used by the UI difficulty picker. */
export const NONOGRAM_PRESETS: Record<Difficulty, { width: number; height: number }> = {
  easy: { width: 5, height: 5 },
  medium: { width: 10, height: 10 },
  hard: { width: 15, height: 15 },
  expert: { width: 20, height: 15 },
}

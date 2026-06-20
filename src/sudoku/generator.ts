import type { Difficulty } from '../lib/types'
import { Rng } from '../lib/rng'
import {
  buildRandomFullGrid,
  cloneGrid,
  countGivens,
  countSolutions,
  gradeSudoku,
} from './solver'
import type { SudokuGrid, SudokuPuzzle } from './types'

/** Roughly how many givens to leave for each requested difficulty. */
const TARGET_GIVENS: Record<Difficulty, number> = {
  easy: 44,
  medium: 34,
  hard: 27,
  expert: 23,
}

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 }

export interface SudokuGenOptions {
  /** Requested difficulty; the generator resamples to honour it where it can. */
  difficulty?: Difficulty
  /** Override the target number of givens. */
  targetGivens?: number
  /** Resample attempts before returning the closest graded match (default 30). */
  maxAttempts?: number
}

/** One full-grid build + dig pass; returns a unique puzzle and its honest grade. */
function digOne(seed: string, target: number): SudokuPuzzle {
  const rng = new Rng(seed)
  const full = buildRandomFullGrid(() => rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]))
  const grid: SudokuGrid = cloneGrid(full)

  const positions = rng.shuffle(Array.from({ length: 81 }, (_, i) => i))
  let givens = 81
  for (const pos of positions) {
    if (givens <= target) break
    const r = Math.floor(pos / 9)
    const c = pos % 9
    if (grid[r]![c] === 0) continue
    const saved = grid[r]![c]!
    grid[r]![c] = 0
    if (countSolutions(grid, 2).count !== 1) {
      grid[r]![c] = saved // removal broke uniqueness — keep the clue
    } else {
      givens--
    }
  }

  const grade = gradeSudoku(grid)
  return {
    grid,
    solution: full,
    givens: countGivens(grid),
    seed,
    difficulty: grade.difficulty,
    score: grade.score,
  }
}

/**
 * Generate a sudoku with a guaranteed-unique solution.
 *
 * Each attempt builds a random complete grid (deterministic from the seed) and
 * removes cells in random order, keeping a removal only while the DLX oracle
 * confirms exactly one solution remains — so the dug puzzle's unique solution is
 * the original full grid. Givens count is only a coarse proxy for difficulty, so
 * when a target difficulty is requested we resample over seed-salted attempts and
 * return the first whose *graded* difficulty matches, falling back to the closest.
 * `puzzle.difficulty` is always the honest grade of the returned board.
 */
export function generateSudoku(
  seed: string | number,
  opts: SudokuGenOptions = {},
): SudokuPuzzle {
  const requested = opts.difficulty
  const target = opts.targetGivens ?? TARGET_GIVENS[requested ?? 'medium']
  const maxAttempts = opts.maxAttempts ?? 30
  const seedStr = String(seed)

  let best: SudokuPuzzle | null = null
  let bestDistance = Infinity

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const puzzle = digOne(`${seedStr}#${attempt}`, target)
    if (!requested) return puzzle
    if (puzzle.difficulty === requested) return puzzle
    const distance = Math.abs(RANK[puzzle.difficulty] - RANK[requested])
    if (distance < bestDistance) {
      bestDistance = distance
      best = puzzle
    }
  }
  return best as SudokuPuzzle // always set after attempt 0
}

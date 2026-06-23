import type { Difficulty } from '../lib/types'
import { Rng } from '../lib/rng'
import { cluesFromLoop, gradeSlitherlink, isSingleLoop, solveSlitherlink } from './solver'
import type { Clue, Loop, SlitherlinkPuzzle } from './types'

/** Board size per requested difficulty (bigger = more loop to trace). */
export const SLITHER_PRESETS: Record<Difficulty, { rows: number; cols: number }> = {
  easy: { rows: 5, cols: 5 },
  medium: { rows: 6, cols: 6 },
  hard: { rows: 7, cols: 7 },
  expert: { rows: 7, cols: 7 },
}

/**
 * Digging recipe per difficulty. `keep` is a lower bound on the fraction of cells to
 * stay clued; `pureLogic` requires the dug board to remain solvable by propagation
 * alone (no guessing) — so easy/medium are never-guess boards (cf. the nonogram), and
 * hard/expert are the ones that force search. The honest grade is decided by the
 * solver and resampling honours the request.
 */
const DIG: Record<Difficulty, { keep: number; pureLogic: boolean }> = {
  easy: { keep: 0.6, pureLogic: true },
  medium: { keep: 0.4, pureLogic: true },
  hard: { keep: 0.58, pureLogic: false },
  expert: { keep: 0.12, pureLogic: false },
}

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 }

export interface SlitherlinkGenOptions {
  /** Requested difficulty; the generator resamples to honour it where it can. */
  difficulty?: Difficulty
  /** Override board size. */
  size?: { rows: number; cols: number }
  /** Resample attempts before returning the closest graded match (default 48). */
  maxAttempts?: number
}

type Region = boolean[][]

function makeRegion(rows: number, cols: number): Region {
  return Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false))
}

function regionSize(region: Region): number {
  let n = 0
  for (const row of region) for (const cell of row) if (cell) n++
  return n
}

const inBounds = (r: number, c: number, rows: number, cols: number): boolean =>
  r >= 0 && r < rows && c >= 0 && c < cols

/** Is cell (r,c) part of the region? Out-of-grid counts as outside (false). */
function inRegion(region: Region, r: number, c: number, rows: number, cols: number): boolean {
  return inBounds(r, c, rows, cols) && region[r]![c]!
}

const NB4: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

/**
 * Grow a connected blob from a random seed cell up to a randomised target size, then
 * normalise it so its boundary is a single simple loop (fill interior holes and the
 * diagonal "pinches" that would make the boundary touch itself). Returns null on the
 * rare degenerate result (empty or whole-grid region).
 */
function growRegion(rng: Rng, rows: number, cols: number): Region | null {
  const n = rows * cols
  const target = Math.max(2, Math.min(n - 1, rng.range(Math.floor(n * 0.32), Math.ceil(n * 0.6))))

  const region = makeRegion(rows, cols)
  const sr = rng.int(rows)
  const sc = rng.int(cols)
  region[sr]![sc] = true
  let size = 1

  // Frontier = non-region cells adjacent to the region. Track membership to dedupe.
  const frontier: Array<[number, number]> = []
  const inFrontier = makeRegion(rows, cols)
  const pushFrontier = (r: number, c: number): void => {
    for (const [dr, dc] of NB4) {
      const nr = r + dr
      const nc = c + dc
      if (inBounds(nr, nc, rows, cols) && !region[nr]![nc] && !inFrontier[nr]![nc]) {
        inFrontier[nr]![nc] = true
        frontier.push([nr, nc])
      }
    }
  }
  pushFrontier(sr, sc)

  while (size < target && frontier.length > 0) {
    const idx = rng.int(frontier.length)
    const [r, c] = frontier[idx]!
    // swap-remove
    frontier[idx] = frontier[frontier.length - 1]!
    frontier.pop()
    if (region[r]![c]) continue
    region[r]![c] = true
    size++
    pushFrontier(r, c)
  }

  normalizeRegion(region, rows, cols)

  const finalSize = regionSize(region)
  if (finalSize < 2 || finalSize >= n) return null
  return region
}

/**
 * Make the region's boundary a single simple loop:
 *   • fill holes        — interior non-region pockets (their own boundary loop)
 *   • repair pinches     — a dot where the region touches itself only diagonally,
 *                          which would split the boundary into a figure-8
 * Both only ever *add* cells, so this converges (region size is bounded).
 */
function normalizeRegion(region: Region, rows: number, cols: number): void {
  for (;;) {
    const filled = fillHoles(region, rows, cols)
    const pinched = repairPinches(region, rows, cols)
    if (!filled && !pinched) break
  }
}

/** Flood the complement from outside the grid; any unreached non-region cell is a hole. */
function fillHoles(region: Region, rows: number, cols: number): boolean {
  const reachable = makeRegion(rows, cols)
  const stack: Array<[number, number]> = []
  // Seed from every border non-region cell (all connected to the outside).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const onBorder = r === 0 || c === 0 || r === rows - 1 || c === cols - 1
      if (onBorder && !region[r]![c] && !reachable[r]![c]) {
        reachable[r]![c] = true
        stack.push([r, c])
      }
    }
  }
  while (stack.length > 0) {
    const [r, c] = stack.pop()!
    for (const [dr, dc] of NB4) {
      const nr = r + dr
      const nc = c + dc
      if (inBounds(nr, nc, rows, cols) && !region[nr]![nc] && !reachable[nr]![nc]) {
        reachable[nr]![nc] = true
        stack.push([nr, nc])
      }
    }
  }
  let changed = false
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!region[r]![c] && !reachable[r]![c]) {
        region[r]![c] = true // a hole — fill it
        changed = true
      }
    }
  }
  return changed
}

/**
 * A pinch is a dot whose four surrounding cells form a region checkerboard
 * (the two diagonal cells in, the other two out, or vice-versa). Filling one of the
 * out-cells removes the self-touch. Out-of-grid cells count as outside.
 */
function repairPinches(region: Region, rows: number, cols: number): boolean {
  let changed = false
  for (let dr = 1; dr < rows; dr++) {
    for (let dc = 1; dc < cols; dc++) {
      const nw = inRegion(region, dr - 1, dc - 1, rows, cols)
      const ne = inRegion(region, dr - 1, dc, rows, cols)
      const sw = inRegion(region, dr, dc - 1, rows, cols)
      const se = inRegion(region, dr, dc, rows, cols)
      if (nw && se && !ne && !sw) {
        region[dr - 1]![dc] = true // fill NE
        changed = true
      } else if (ne && sw && !nw && !se) {
        region[dr - 1]![dc - 1] = true // fill NW
        changed = true
      }
    }
  }
  return changed
}

/** The boundary loop of a region: an edge is on the loop iff it separates in from out. */
function loopFromRegion(region: Region, rows: number, cols: number): Loop {
  const h = Array.from({ length: rows + 1 }, () => new Array<boolean>(cols).fill(false))
  const v = Array.from({ length: rows }, () => new Array<boolean>(cols + 1).fill(false))
  for (let dr = 0; dr <= rows; dr++) {
    for (let c = 0; c < cols; c++) {
      const above = inRegion(region, dr - 1, c, rows, cols)
      const below = inRegion(region, dr, c, rows, cols)
      h[dr]![c] = above !== below
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let dc = 0; dc <= cols; dc++) {
      const left = inRegion(region, r, dc - 1, rows, cols)
      const right = inRegion(region, r, dc, rows, cols)
      v[r]![dc] = left !== right
    }
  }
  return { h, v }
}

/** One region build + dig pass; returns a unique puzzle and its honest grade, or null. */
function digOne(
  seed: string,
  rows: number,
  cols: number,
  keepFraction: number,
  pureLogic: boolean,
): SlitherlinkPuzzle | null {
  const rng = new Rng(seed)
  const region = growRegion(rng, rows, cols)
  if (!region) return null

  const loop = loopFromRegion(region, rows, cols)
  // Region normalisation should guarantee this, but the oracle has the final word.
  if (!isSingleLoop(loop, rows, cols)) return null

  const full = cluesFromLoop(loop, rows, cols)
  // Full clues must already pin the loop down uniquely, else this region is ambiguous.
  if (solveSlitherlink(rows, cols, full, 2).status !== 'unique') return null

  const clues: Clue[][] = full.map((row) => row.slice())
  let clueCount = rows * cols
  const target = Math.ceil(rows * cols * keepFraction)

  const positions = rng.shuffle(Array.from({ length: rows * cols }, (_, i) => i))
  for (const pos of positions) {
    if (clueCount <= target) break
    const r = Math.floor(pos / cols)
    const c = pos % cols
    if (clues[r]![c] == null) continue
    const saved = clues[r]![c]
    clues[r]![c] = null
    const res = solveSlitherlink(rows, cols, clues, 2)
    // Keep the removal only if the board stays unique — and, for easy/medium, only if
    // it stays solvable without guessing.
    if (res.status !== 'unique' || (pureLogic && res.stats.usedBacktracking)) {
      clues[r]![c] = saved
    } else {
      clueCount--
    }
  }

  const final = solveSlitherlink(rows, cols, clues, 2)
  const grade = gradeSlitherlink(final.stats, rows * cols)
  return {
    rows,
    cols,
    clues,
    solution: loop,
    clueCount,
    seed,
    difficulty: grade.difficulty,
    score: grade.score,
  }
}

/**
 * Generate a slitherlink with a guaranteed-unique solution.
 *
 * Each attempt grows a random simply-connected region whose boundary is a single loop
 * (deterministic from the seed), derives full clues, and removes clues in random order
 * while the solver oracle confirms exactly one solution remains. Clue count is only a
 * coarse difficulty proxy, so when a target difficulty is requested we resample over
 * seed-salted attempts and return the first whose *graded* difficulty matches, falling
 * back to the closest. `puzzle.difficulty` is always the honest grade of the board.
 */
export function generateSlitherlink(
  seed: string | number,
  opts: SlitherlinkGenOptions = {},
): SlitherlinkPuzzle {
  const requested = opts.difficulty
  const { rows, cols } = opts.size ?? SLITHER_PRESETS[requested ?? 'medium']
  const { keep, pureLogic } = DIG[requested ?? 'medium']
  const maxAttempts = opts.maxAttempts ?? 48
  const seedStr = String(seed)

  let best: SlitherlinkPuzzle | null = null
  let bestDistance = Infinity

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const puzzle = digOne(`${seedStr}#${attempt}`, rows, cols, keep, pureLogic)
    if (!puzzle) continue
    if (!requested) return puzzle
    if (puzzle.difficulty === requested) return puzzle
    const distance = Math.abs(RANK[puzzle.difficulty] - RANK[requested])
    if (distance < bestDistance) {
      bestDistance = distance
      best = puzzle
    }
  }

  if (best) return best
  // Extremely unlikely fallback: every attempt was degenerate. Force a plain board.
  return digOne(`${seedStr}#fallback`, rows, cols, 0.6, false) ?? forceTrivial(rows, cols, seedStr)
}

/**
 * Last-resort board for the astronomically unlikely case where every dig attempt came
 * back degenerate. A 2×2 block in the top-left corner: its boundary is a clean square
 * loop, and the full clues derived from it pin that loop down uniquely (every other
 * cell becomes a forced 0). This is valid *by construction* for any board at least 2×2
 * — the only sizes the game ever uses — with clues always in 0..3, so the fallback can
 * never emit an invalid puzzle. (Slitherlink has no non-trivial loop below 2×2.)
 */
function forceTrivial(rows: number, cols: number, seed: string): SlitherlinkPuzzle {
  const region = makeRegion(rows, cols)
  if (rows >= 2 && cols >= 2) {
    region[0]![0] = true
    region[0]![1] = true
    region[1]![0] = true
    region[1]![1] = true
  }
  const loop = loopFromRegion(region, rows, cols)
  const full = cluesFromLoop(loop, rows, cols)
  const final = solveSlitherlink(rows, cols, full, 2)
  const grade = gradeSlitherlink(final.stats, rows * cols)
  return {
    rows,
    cols,
    clues: full.map((row) => row.slice()),
    solution: loop,
    clueCount: rows * cols,
    seed,
    difficulty: grade.difficulty,
    score: grade.score,
  }
}

import type { Difficulty } from '../lib/types'
import { Rng } from '../lib/rng'
import { DIRS, computePushDist, inBounds, isSolved } from './level'
import { solveSokoban } from './solver'
import type { SokobanGrade, SokobanLevel, SokobanPuzzle, SokobanSolution } from './types'

interface Preset {
  width: number
  height: number
  boxes: number
  steps: number
  wallDensity: number
}

const PRESETS: Record<Difficulty, Preset> = {
  easy: { width: 7, height: 6, boxes: 2, steps: 50, wallDensity: 0.05 },
  medium: { width: 8, height: 7, boxes: 3, steps: 90, wallDensity: 0.07 },
  hard: { width: 9, height: 8, boxes: 4, steps: 150, wallDensity: 0.08 },
  expert: { width: 10, height: 9, boxes: 4, steps: 230, wallDensity: 0.1 },
}

/** Indices of all non-wall cells. */
function floorCells(level: SokobanLevel): number[] {
  const cells: number[] = []
  for (let i = 0; i < level.walls.length; i++) if (!level.walls[i]) cells.push(i)
  return cells
}

/** Are all floor cells mutually reachable (ignoring boxes)? */
function floorConnected(level: SokobanLevel): boolean {
  const floors = floorCells(level)
  if (floors.length === 0) return false
  const W = level.width
  const seen = new Set<number>([floors[0]!])
  const stack = [floors[0]!]
  while (stack.length) {
    const cur = stack.pop()!
    const r = Math.floor(cur / W)
    const c = cur % W
    for (const d of DIRS) {
      const nr = r + d.dr
      const nc = c + d.dc
      if (!inBounds(level, nr, nc)) continue
      const ni = nr * W + nc
      if (!level.walls[ni] && !seen.has(ni)) {
        seen.add(ni)
        stack.push(ni)
      }
    }
  }
  return seen.size === floors.length
}

/** A solved level: border walls + sparse interior walls, boxes resting on goals. */
function buildSolvedLevel(rng: Rng, preset: Preset): SokobanLevel {
  const { width, height, boxes: numBoxes, wallDensity } = preset

  for (let attempt = 0; attempt < 8; attempt++) {
    const walls = new Array<boolean>(width * height).fill(false)
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (r === 0 || c === 0 || r === height - 1 || c === width - 1) {
          walls[r * width + c] = true
        }
      }
    }
    // Sparse interior walls — fewer on each retry.
    const interior: number[] = []
    for (let r = 1; r < height - 1; r++)
      for (let c = 1; c < width - 1; c++) interior.push(r * width + c)
    const wallBudget = Math.max(0, Math.floor(interior.length * wallDensity) - attempt)
    const shuffledInterior = rng.shuffle(interior.slice())
    for (let i = 0; i < wallBudget; i++) walls[shuffledInterior[i]!] = true

    const level: SokobanLevel = {
      width,
      height,
      walls,
      goals: new Array<boolean>(width * height).fill(false),
      boxes: [],
      player: -1,
    }
    if (!floorConnected(level)) continue

    const floors = rng.shuffle(floorCells(level))
    if (floors.length < numBoxes + 1) continue

    const goalCells = floors.slice(0, numBoxes).sort((a, b) => a - b)
    for (const g of goalCells) level.goals[g] = true
    level.boxes = goalCells.slice() // solved: boxes on goals
    level.player = floors[numBoxes]! // a non-goal floor cell

    // Every goal must be a "live" cell (reachable by pulling) — true for any floor
    // cell that a box can be on, which goals always are. Sanity check anyway.
    const dist = computePushDist(level)
    if (goalCells.every((g) => dist[g] !== Infinity)) return level
  }
  throw new Error('failed to build a sokoban room')
}

/**
 * Scramble a solved level by random *reverse* play (pulls). Any state reachable by
 * pulling boxes away from goals is, by construction, solvable by pushing them back —
 * so generation never has to reject for unsolvability. We keep the most-displaced
 * state sampled (largest total push-distance from goals).
 */
function reverseScramble(
  rng: Rng,
  level: SokobanLevel,
  steps: number,
): { boxes: number[]; player: number } {
  const W = level.width
  const dist = computePushDist(level)
  const floor = (i: number): boolean => !level.walls[i]

  let player = level.player
  const boxes = new Set(level.boxes)

  const displacement = (): number => {
    let s = 0
    for (const b of boxes) s += dist[b] === Infinity ? 0 : dist[b]!
    return s
  }

  let best = { boxes: [...boxes].sort((a, b) => a - b), player, score: -1 }

  for (let step = 0; step < steps; step++) {
    const pulls: Array<{ box: number; newPlayer: number; dest: number }> = []
    const walks: number[] = []
    const pr = Math.floor(player / W)
    const pc = player % W
    for (const d of DIRS) {
      const boxCell = (pr + d.dr) * W + (pc + d.dc)
      const newPlayer = (pr - d.dr) * W + (pc - d.dc)
      const walkCell = (pr + d.dr) * W + (pc + d.dc)
      if (
        inBounds(level, pr - d.dr, pc - d.dc) &&
        boxes.has(boxCell) &&
        floor(newPlayer) &&
        !boxes.has(newPlayer)
      ) {
        // Pull: box moves boxCell -> player's cell, player -> newPlayer.
        pulls.push({ box: boxCell, newPlayer, dest: player })
      }
      if (inBounds(level, pr + d.dr, pc + d.dc) && floor(walkCell) && !boxes.has(walkCell)) {
        walks.push(walkCell)
      }
    }

    if (pulls.length > 0 && (walks.length === 0 || rng.bool(0.82))) {
      const pull = rng.pick(pulls)
      boxes.delete(pull.box)
      boxes.add(pull.dest)
      player = pull.newPlayer
    } else if (walks.length > 0) {
      player = rng.pick(walks)
    }

    const score = displacement()
    if (score > best.score) {
      best = { boxes: [...boxes].sort((a, b) => a - b), player, score }
    }
  }

  return { boxes: best.boxes, player: best.player }
}

export function gradeSokoban(solution: SokobanSolution): SokobanGrade {
  const score = solution.stats.pushLength * 1.5 + Math.sqrt(solution.stats.expanded) * 1.2
  let difficulty: Difficulty
  if (score < 12) difficulty = 'easy'
  else if (score < 28) difficulty = 'medium'
  else if (score < 60) difficulty = 'hard'
  else difficulty = 'expert'
  return { score: Math.round(score * 100) / 100, difficulty }
}

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 }

export interface SokobanGenOptions {
  difficulty?: Difficulty
  /** Attempts before returning the closest graded match (default 24). */
  maxAttempts?: number
}

/**
 * Generate a solvable Sokoban puzzle, deterministically from the seed.
 *
 * Each attempt scrambles a fresh solved room by reverse pulls (so solvability is
 * guaranteed), then the A* oracle grades it. We return the first attempt whose
 * grade matches the request, else the closest graded match. `puzzle.difficulty`
 * is always the honest grade of the returned level.
 */
export function generateSokoban(
  seed: string | number,
  opts: SokobanGenOptions = {},
): SokobanPuzzle {
  const difficulty = opts.difficulty ?? 'medium'
  const preset = PRESETS[difficulty]
  const maxAttempts = opts.maxAttempts ?? 24
  const rng = new Rng(seed)

  let best: SokobanPuzzle | null = null
  let bestDistance = Infinity

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solved = buildSolvedLevel(rng, preset)
    const scrambled = reverseScramble(rng, solved, preset.steps)

    // A scramble that left every box on a goal is a non-puzzle; retry.
    if (isSolved(solved, scrambled.boxes)) continue

    const level: SokobanLevel = {
      width: solved.width,
      height: solved.height,
      walls: solved.walls,
      goals: solved.goals,
      boxes: scrambled.boxes,
      player: scrambled.player,
    }

    const solution = solveSokoban(level)
    if (!solution.solved || solution.pushes.length === 0) continue

    const grade = gradeSokoban(solution)
    const puzzle: SokobanPuzzle = {
      level,
      seed: String(seed),
      difficulty: grade.difficulty,
      score: grade.score,
      solution,
    }
    if (grade.difficulty === difficulty) return puzzle
    const distance = Math.abs(RANK[grade.difficulty] - RANK[difficulty])
    if (distance < bestDistance) {
      bestDistance = distance
      best = puzzle
    }
  }

  if (best) return best
  throw new Error(`sokoban generation failed (seed ${String(seed)}, ${difficulty})`)
}

export { PRESETS as SOKOBAN_PRESETS }

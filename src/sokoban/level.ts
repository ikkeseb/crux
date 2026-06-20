import type { SokobanLevel } from './types'

/** Movement directions, indexed; `ch` is the LURD move character (push = upper-case). */
export const DIRS = [
  { dr: -1, dc: 0, ch: 'U' },
  { dr: 1, dc: 0, ch: 'D' },
  { dr: 0, dc: -1, ch: 'L' },
  { dr: 0, dc: 1, ch: 'R' },
] as const

export const idx = (level: { width: number }, r: number, c: number): number =>
  r * level.width + c
export const rowOf = (level: { width: number }, i: number): number =>
  Math.floor(i / level.width)
export const colOf = (level: { width: number }, i: number): number => i % level.width

export function inBounds(level: SokobanLevel, r: number, c: number): boolean {
  return r >= 0 && r < level.height && c >= 0 && c < level.width
}

/** Parse an ASCII level. `#` wall, ` ` floor, `.` goal, `$` box, `*` box on goal,
 *  `@` player, `+` player on goal. */
export function parseLevel(ascii: string): SokobanLevel {
  const lines = ascii.replace(/\n$/, '').split('\n')
  const height = lines.length
  const width = Math.max(...lines.map((l) => l.length))
  const walls = new Array<boolean>(width * height).fill(false)
  const goals = new Array<boolean>(width * height).fill(false)
  const boxes: number[] = []
  let player = -1

  for (let r = 0; r < height; r++) {
    const line = lines[r] ?? ''
    for (let c = 0; c < width; c++) {
      const ch = line[c] ?? ' '
      const i = r * width + c
      switch (ch) {
        case '#':
          walls[i] = true
          break
        case '.':
          goals[i] = true
          break
        case '$':
          boxes.push(i)
          break
        case '*':
          goals[i] = true
          boxes.push(i)
          break
        case '@':
          player = i
          break
        case '+':
          goals[i] = true
          player = i
          break
        default:
          break
      }
    }
  }
  boxes.sort((a, b) => a - b)
  return { width, height, walls, goals, boxes, player }
}

/** Render a level (with a given dynamic state) back to ASCII — handy for tests/debug. */
export function toAscii(
  level: SokobanLevel,
  boxes: number[] = level.boxes,
  player: number = level.player,
): string {
  const boxSet = new Set(boxes)
  const lines: string[] = []
  for (let r = 0; r < level.height; r++) {
    let line = ''
    for (let c = 0; c < level.width; c++) {
      const i = r * level.width + c
      const goal = level.goals[i]
      if (level.walls[i]) line += '#'
      else if (i === player) line += goal ? '+' : '@'
      else if (boxSet.has(i)) line += goal ? '*' : '$'
      else line += goal ? '.' : ' '
    }
    lines.push(line)
  }
  return lines.join('\n')
}

export const isSolved = (level: SokobanLevel, boxes: number[]): boolean =>
  boxes.every((b) => level.goals[b])

export const charToDir = (ch: string): number => {
  switch (ch.toUpperCase()) {
    case 'U':
      return 0
    case 'D':
      return 1
    case 'L':
      return 2
    case 'R':
      return 3
    default:
      return -1
  }
}

export interface DynState {
  boxes: number[]
  player: number
}

/**
 * Apply one player move. Returns the new state (boxes kept sorted) and whether a
 * box was pushed, or null if the move is blocked by a wall or an immovable box.
 * Shared by the player UI and tests so move semantics stay identical everywhere.
 */
export function applyMove(
  level: SokobanLevel,
  state: DynState,
  dirIndex: number,
): { boxes: number[]; player: number; pushed: boolean } | null {
  const W = level.width
  const d = DIRS[dirIndex]
  if (!d) return null
  const pr = Math.floor(state.player / W)
  const pc = state.player % W
  const tr = pr + d.dr
  const tc = pc + d.dc
  if (!inBounds(level, tr, tc)) return null
  const t = tr * W + tc
  if (level.walls[t]) return null

  const boxSet = new Set(state.boxes)
  if (boxSet.has(t)) {
    const br = tr + d.dr
    const bc = tc + d.dc
    if (!inBounds(level, br, bc)) return null
    const bdest = br * W + bc
    if (level.walls[bdest] || boxSet.has(bdest)) return null
    boxSet.delete(t)
    boxSet.add(bdest)
    return { player: t, boxes: [...boxSet].sort((a, b) => a - b), pushed: true }
  }
  return { player: t, boxes: state.boxes.slice(), pushed: false }
}

/**
 * Minimum pushes to move a single box from each cell to its nearest goal,
 * ignoring other boxes (an admissible A* heuristic component). Computed by a
 * reverse-push (pull) BFS from every goal. Cells that come back Infinity are
 * "simple deadlocks": a box there can never reach any goal, so any state with a
 * box on one can be pruned without losing completeness.
 */
export function computePushDist(level: SokobanLevel): number[] {
  const n = level.width * level.height
  const dist = new Array<number>(n).fill(Infinity)
  const floor = (r: number, c: number): boolean =>
    inBounds(level, r, c) && !level.walls[r * level.width + c]

  const queue: number[] = []
  for (let i = 0; i < n; i++) {
    if (level.goals[i] && !level.walls[i]) {
      dist[i] = 0
      queue.push(i)
    }
  }

  let head = 0
  while (head < queue.length) {
    const c = queue[head++]!
    const cr = Math.floor(c / level.width)
    const cc = c % level.width
    for (const d of DIRS) {
      // Predecessor box cell p such that a box at p could be pushed onto c.
      const pr = cr - d.dr
      const pc = cc - d.dc
      // Player must stand on the far side of p to push it toward c.
      const plr = cr - 2 * d.dr
      const plc = cc - 2 * d.dc
      if (!floor(pr, pc) || !floor(plr, plc)) continue
      const p = pr * level.width + pc
      if (dist[p]! > dist[c]! + 1) {
        dist[p] = dist[c]! + 1
        queue.push(p)
      }
    }
  }
  return dist
}

/**
 * Cells the player can reach from `player` without crossing walls or boxes, plus
 * the canonical (smallest-index) cell of that region. States that share box
 * positions and player region are equivalent for push-search, so normalizing the
 * player to that canonical cell collapses them.
 */
export function playerReach(
  level: SokobanLevel,
  boxSet: Set<number>,
  player: number,
): { reachable: Uint8Array; normalized: number } {
  const n = level.width * level.height
  const reachable = new Uint8Array(n)
  const stack = [player]
  reachable[player] = 1
  let normalized = player
  while (stack.length) {
    const cur = stack.pop()!
    if (cur < normalized) normalized = cur
    const cr = Math.floor(cur / level.width)
    const cc = cur % level.width
    for (const d of DIRS) {
      const nr = cr + d.dr
      const nc = cc + d.dc
      if (!inBounds(level, nr, nc)) continue
      const ni = nr * level.width + nc
      if (reachable[ni] || level.walls[ni] || boxSet.has(ni)) continue
      reachable[ni] = 1
      if (ni < normalized) normalized = ni
      stack.push(ni)
    }
  }
  return { reachable, normalized }
}

/** Shortest player walk (no boxes pushed) from `start` to `target`, as LURD chars, or null. */
export function playerPath(
  level: SokobanLevel,
  boxSet: Set<number>,
  start: number,
  target: number,
): string | null {
  if (start === target) return ''
  const n = level.width * level.height
  const prev = new Int32Array(n).fill(-1)
  const prevDir = new Int8Array(n).fill(-1)
  const seen = new Uint8Array(n)
  const queue = [start]
  seen[start] = 1
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]!
    if (cur === target) break
    const cr = Math.floor(cur / level.width)
    const cc = cur % level.width
    for (let di = 0; di < DIRS.length; di++) {
      const d = DIRS[di]!
      const nr = cr + d.dr
      const nc = cc + d.dc
      if (!inBounds(level, nr, nc)) continue
      const ni = nr * level.width + nc
      if (seen[ni] || level.walls[ni] || boxSet.has(ni)) continue
      seen[ni] = 1
      prev[ni] = cur
      prevDir[ni] = di
      queue.push(ni)
    }
  }
  if (!seen[target]) return null
  const moves: string[] = []
  let cur = target
  while (cur !== start) {
    const di = prevDir[cur]!
    moves.push(DIRS[di]!.ch.toLowerCase())
    cur = prev[cur]!
  }
  moves.reverse()
  return moves.join('')
}

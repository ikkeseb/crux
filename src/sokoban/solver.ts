import {
  DIRS,
  computePushDist,
  inBounds,
  isSolved,
  playerPath,
  playerReach,
} from './level'
import type { Push, SokobanLevel, SokobanSolution, SokobanSolveStats } from './types'

/** A* over (boxes, normalized-player) states; minimises number of pushes. */

class MinHeap {
  private fs: number[] = []
  private gs: number[] = []
  private ks: string[] = []

  size(): number {
    return this.fs.length
  }

  push(f: number, g: number, key: string): void {
    this.fs.push(f)
    this.gs.push(g)
    this.ks.push(key)
    let i = this.fs.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.less(i, parent)) {
        this.swap(i, parent)
        i = parent
      } else break
    }
  }

  pop(): { f: number; g: number; key: string } {
    const f = this.fs[0]!
    const g = this.gs[0]!
    const key = this.ks[0]!
    const last = this.fs.length - 1
    this.swap(0, last)
    this.fs.pop()
    this.gs.pop()
    this.ks.pop()
    let i = 0
    const size = this.fs.length
    for (;;) {
      const l = 2 * i + 1
      const r = 2 * i + 2
      let smallest = i
      if (l < size && this.less(l, smallest)) smallest = l
      if (r < size && this.less(r, smallest)) smallest = r
      if (smallest === i) break
      this.swap(i, smallest)
      i = smallest
    }
    return { f, g, key }
  }

  private less(a: number, b: number): boolean {
    if (this.fs[a] !== this.fs[b]) return this.fs[a]! < this.fs[b]!
    return this.gs[a]! > this.gs[b]! // tie-break: prefer deeper g (closer to goal)
  }

  private swap(a: number, b: number): void {
    ;[this.fs[a], this.fs[b]] = [this.fs[b]!, this.fs[a]!]
    ;[this.gs[a], this.gs[b]] = [this.gs[b]!, this.gs[a]!]
    ;[this.ks[a], this.ks[b]] = [this.ks[b]!, this.ks[a]!]
  }
}

const stateKey = (boxes: number[], normalized: number): string =>
  `${boxes.join(',')}|${normalized}`

export interface SokobanSolveOptions {
  /** Abort and report unsolved after this many state expansions (default 300k). */
  maxExpansions?: number
}

function emptyStats(): SokobanSolveStats {
  return { expanded: 0, generated: 0, pushLength: 0, moveLength: 0 }
}

export function solveSokoban(
  level: SokobanLevel,
  opts: SokobanSolveOptions = {},
): SokobanSolution {
  const maxExpansions = opts.maxExpansions ?? 300_000
  const W = level.width
  const pushDist = computePushDist(level)
  const stats = emptyStats()

  const startBoxes = level.boxes.slice().sort((a, b) => a - b)
  if (isSolved(level, startBoxes)) {
    return { solved: true, status: 'solved', pushes: [], moves: '', stats }
  }

  const heuristic = (boxes: number[]): number => {
    let h = 0
    for (const b of boxes) {
      const d = pushDist[b]!
      if (d === Infinity) return Infinity
      h += d
    }
    return h
  }

  const startReach = playerReach(level, new Set(startBoxes), level.player)
  const startKey = stateKey(startBoxes, startReach.normalized)
  const startH = heuristic(startBoxes)
  if (startH === Infinity) {
    // A box sits on a simple-deadlock square — no solution can exist.
    return { solved: false, status: 'unsolvable', pushes: [], moves: '', stats }
  }

  const gScore = new Map<string, number>()
  const came = new Map<string, { prevKey: string; push: Push }>()
  const stateInfo = new Map<string, { boxes: number[]; norm: number }>()
  gScore.set(startKey, 0)
  stateInfo.set(startKey, { boxes: startBoxes, norm: startReach.normalized })

  const heap = new MinHeap()
  heap.push(startH, 0, startKey)

  let goalKey: string | null = null
  let capped = false

  while (heap.size() > 0) {
    const top = heap.pop()
    const key = top.key
    const g = gScore.get(key)!
    if (top.g > g) continue // stale heap entry

    const info = stateInfo.get(key)!
    const boxes = info.boxes
    if (isSolved(level, boxes)) {
      goalKey = key
      break
    }
    if (stats.expanded >= maxExpansions) {
      capped = true
      break
    }
    stats.expanded++

    const boxSet = new Set(boxes)
    const { reachable } = playerReach(level, boxSet, info.norm)

    for (const b of boxes) {
      const br = Math.floor(b / W)
      const bc = b % W
      for (let di = 0; di < DIRS.length; di++) {
        const d = DIRS[di]!
        const tr = br + d.dr
        const tc = bc + d.dc
        const pr = br - d.dr
        const pc = bc - d.dc
        if (!inBounds(level, tr, tc) || !inBounds(level, pr, pc)) continue
        const t = tr * W + tc
        const p = pr * W + pc
        if (level.walls[t] || boxSet.has(t) || pushDist[t] === Infinity) continue
        if (level.walls[p] || boxSet.has(p) || !reachable[p]) continue

        const newBoxes = boxes.filter((x) => x !== b)
        newBoxes.push(t)
        newBoxes.sort((a, z) => a - z)
        const playerAfter = b
        const nr = playerReach(level, new Set(newBoxes), playerAfter)
        const nKey = stateKey(newBoxes, nr.normalized)
        const ng = g + 1
        stats.generated++

        const known = gScore.get(nKey)
        if (known === undefined || ng < known) {
          gScore.set(nKey, ng)
          stateInfo.set(nKey, { boxes: newBoxes, norm: nr.normalized })
          came.set(nKey, { prevKey: key, push: { from: b, dir: di } })
          const h = heuristic(newBoxes)
          if (h !== Infinity) heap.push(ng + h, ng, nKey)
        }
      }
    }
  }

  if (goalKey === null) {
    // Heap-empty exit is a true unsolvability proof; a cap break is inconclusive.
    return {
      solved: false,
      status: capped ? 'capped' : 'unsolvable',
      pushes: [],
      moves: '',
      stats,
    }
  }

  // Reconstruct the push sequence...
  const pushes: Push[] = []
  let k: string = goalKey
  while (k !== startKey) {
    const e = came.get(k)!
    pushes.push(e.push)
    k = e.prevKey
  }
  pushes.reverse()

  // ...then expand into a full LURD player path by simulation from the real start.
  const curBoxes = new Set(startBoxes)
  let curPlayer = level.player
  let moves = ''
  for (const push of pushes) {
    const b = push.from
    const d = DIRS[push.dir]!
    const br = Math.floor(b / W)
    const bc = b % W
    const need = (br - d.dr) * W + (bc - d.dc)
    const walk = playerPath(level, curBoxes, curPlayer, need)
    if (walk === null) {
      // Should never happen: the push was validated against player reachability.
      return { solved: false, status: 'capped', pushes: [], moves: '', stats }
    }
    moves += walk + d.ch
    curBoxes.delete(b)
    curBoxes.add(b + d.dr * W + d.dc)
    curPlayer = b
  }

  stats.pushLength = pushes.length
  stats.moveLength = moves.length
  return { solved: true, status: 'solved', pushes, moves, stats }
}

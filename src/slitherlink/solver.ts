import type { Difficulty } from '../lib/types'
import {
  E_CROSS,
  E_LINE,
  E_UNKNOWN,
  type Clue,
  type EdgeState,
  type Loop,
  type SlitherlinkGrade,
  type SlitherlinkSolution,
  type SlitherlinkSolveStats,
  type SolveStatus,
} from './types'

/* ------------------------------------------------------------------ *
 * Edge model
 *
 * A loop lives on the dot lattice of an `rows × cols` cell grid:
 *   h[dr][c]  horizontal edges, (rows+1) × cols
 *   v[r][dc]  vertical edges,    rows × (cols+1)
 *
 * Cell (r,c) is bounded by  top h[r][c] · bottom h[r+1][c]
 *                           left v[r][c] · right  v[r][c+1].
 * Dot (dr,dc) touches        up v[dr-1][dc] · down v[dr][dc]
 *                            left h[dr][dc-1] · right h[dr][dc].
 * ------------------------------------------------------------------ */

interface Edges {
  h: EdgeState[][]
  v: EdgeState[][]
}

/** An edge reference: kind, then the two array indices into that kind's grid. */
type Ref = readonly ['h' | 'v', number, number]

function makeEdges(rows: number, cols: number, fill: EdgeState): Edges {
  return {
    h: Array.from({ length: rows + 1 }, () => new Array<EdgeState>(cols).fill(fill)),
    v: Array.from({ length: rows }, () => new Array<EdgeState>(cols + 1).fill(fill)),
  }
}

function cloneEdges(e: Edges): Edges {
  return { h: e.h.map((r) => r.slice()), v: e.v.map((r) => r.slice()) }
}

const getE = (e: Edges, [t, a, b]: Ref): EdgeState => (t === 'h' ? e.h[a]![b]! : e.v[a]![b]!)
const putE = (e: Edges, [t, a, b]: Ref, val: EdgeState): void => {
  if (t === 'h') e.h[a]![b] = val
  else e.v[a]![b] = val
}

/** The four edges bounding cell (r,c), in a stable order (top, bottom, left, right). */
function cellRefs(r: number, c: number): Ref[] {
  return [
    ['h', r, c],
    ['h', r + 1, c],
    ['v', r, c],
    ['v', r, c + 1],
  ]
}

/** The (up to four) edges incident to dot (dr,dc). */
function dotRefs(dr: number, dc: number, rows: number, cols: number): Ref[] {
  const refs: Ref[] = []
  if (dr > 0) refs.push(['v', dr - 1, dc])
  if (dr < rows) refs.push(['v', dr, dc])
  if (dc > 0) refs.push(['h', dr, dc - 1])
  if (dc < cols) refs.push(['h', dr, dc])
  return refs
}

/* ------------------------------------------------------------------ *
 * Propagation
 *
 * Two complete local rules, run to a fixpoint:
 *   • clue rule — a clued cell's LINE count must reach exactly the clue.
 *   • dot rule  — every dot must finish with degree 0 or 2 (a loop).
 * Both only ever turn UNKNOWN edges into LINE/CROSS; a clash returns false.
 * ------------------------------------------------------------------ */

function propagate(
  e: Edges,
  clues: Clue[][],
  rows: number,
  cols: number,
  stats: SlitherlinkSolveStats,
): boolean {
  const force = (refs: Ref[], val: EdgeState): boolean => {
    let any = false
    for (const ref of refs) {
      if (getE(e, ref) === E_UNKNOWN) {
        putE(e, ref, val)
        stats.forced++
        any = true
      }
    }
    return any
  }

  let changed = true
  while (changed) {
    changed = false
    stats.propagationRounds++

    // Clue rule.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = clues[r]![c]
        if (k == null) continue
        const refs = cellRefs(r, c)
        let line = 0
        let unk = 0
        for (const ref of refs) {
          const s = getE(e, ref)
          if (s === E_LINE) line++
          else if (s === E_UNKNOWN) unk++
        }
        if (line > k) return false
        if (line + unk < k) return false
        if (unk > 0) {
          if (line === k) {
            if (force(refs, E_CROSS)) changed = true
          } else if (line + unk === k) {
            if (force(refs, E_LINE)) changed = true
          }
        }
      }
    }

    // Dot rule.
    for (let dr = 0; dr <= rows; dr++) {
      for (let dc = 0; dc <= cols; dc++) {
        const refs = dotRefs(dr, dc, rows, cols)
        let line = 0
        let unk = 0
        for (const ref of refs) {
          const s = getE(e, ref)
          if (s === E_LINE) line++
          else if (s === E_UNKNOWN) unk++
        }
        if (line > 2) return false
        if (line === 1 && unk === 0) return false // dangling degree-1 dot can never close
        if (unk > 0) {
          if (line === 2) {
            if (force(refs, E_CROSS)) changed = true
          } else if (line === 1 && unk === 1) {
            if (force(refs, E_LINE)) changed = true
          } else if (line === 0 && unk === 1) {
            if (force(refs, E_CROSS)) changed = true
          }
        }
      }
    }
  }
  return true
}

/* ------------------------------------------------------------------ *
 * Loop analysis (single-loop bookkeeping over the current LINE edges)
 * ------------------------------------------------------------------ */

interface Analysis {
  contradiction: boolean
  lineEdges: number
  /** Distinct connected components that contain at least one LINE edge. */
  components: number
  /** A closed cycle (a component where every member dot has degree 2) exists. */
  closedExists: boolean
}

function dotId(dr: number, dc: number, cols: number): number {
  return dr * (cols + 1) + dc
}

function analyze(e: Edges, rows: number, cols: number): Analysis {
  const nDots = (rows + 1) * (cols + 1)
  const parent = new Int32Array(nDots)
  for (let i = 0; i < nDots; i++) parent[i] = i
  const find = (x: number): number => {
    let root = x
    while (parent[root] !== root) root = parent[root]!
    while (parent[x] !== root) {
      const next = parent[x]!
      parent[x] = root
      x = next
    }
    return root
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  const degree = new Int32Array(nDots)
  let lineEdges = 0

  for (let dr = 0; dr <= rows; dr++) {
    for (let c = 0; c < cols; c++) {
      if (e.h[dr]![c] === E_LINE) {
        lineEdges++
        const a = dotId(dr, c, cols)
        const b = dotId(dr, c + 1, cols)
        degree[a]!++
        degree[b]!++
        union(a, b)
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let dc = 0; dc <= cols; dc++) {
      if (e.v[r]![dc] === E_LINE) {
        lineEdges++
        const a = dotId(r, dc, cols)
        const b = dotId(r + 1, dc, cols)
        degree[a]!++
        degree[b]!++
        union(a, b)
      }
    }
  }

  // Per component (only those carrying LINE edges): track whether every member dot
  // has degree exactly 2 (i.e. the component is a closed cycle).
  const allDeg2 = new Map<number, boolean>()
  for (let id = 0; id < nDots; id++) {
    const d = degree[id]!
    if (d === 0) continue
    if (d > 2) return { contradiction: true, lineEdges, components: 0, closedExists: false }
    const root = find(id)
    const prev = allDeg2.get(root)
    const here = d === 2
    allDeg2.set(root, prev === undefined ? here : prev && here)
  }

  let closedExists = false
  for (const v of allDeg2.values()) if (v) closedExists = true

  return { contradiction: false, lineEdges, components: allDeg2.size, closedExists }
}

/** Every clued cell's LINE count equals its clue (loop assumed final / unknowns→cross). */
function cluesSatisfied(e: Edges, clues: Clue[][], rows: number, cols: number): boolean {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = clues[r]![c]
      if (k == null) continue
      let line = 0
      for (const ref of cellRefs(r, c)) if (getE(e, ref) === E_LINE) line++
      if (line !== k) return false
    }
  }
  return true
}

/** Pick an UNKNOWN edge to branch on — prefer one that extends a path (degree-1 dot). */
function pickBranch(e: Edges, rows: number, cols: number): Ref | null {
  for (let dr = 0; dr <= rows; dr++) {
    for (let dc = 0; dc <= cols; dc++) {
      const refs = dotRefs(dr, dc, rows, cols)
      let line = 0
      let unknown: Ref | null = null
      for (const ref of refs) {
        const s = getE(e, ref)
        if (s === E_LINE) line++
        else if (s === E_UNKNOWN && !unknown) unknown = ref
      }
      if (line === 1 && unknown) return unknown
    }
  }
  for (let dr = 0; dr <= rows; dr++)
    for (let c = 0; c < cols; c++) if (e.h[dr]![c] === E_UNKNOWN) return ['h', dr, c]
  for (let r = 0; r < rows; r++)
    for (let dc = 0; dc <= cols; dc++) if (e.v[r]![dc] === E_UNKNOWN) return ['v', r, dc]
  return null
}

function toLoop(e: Edges, rows: number, cols: number): Loop {
  return {
    h: Array.from({ length: rows + 1 }, (_, dr) =>
      Array.from({ length: cols }, (_, c) => e.h[dr]![c] === E_LINE),
    ),
    v: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols + 1 }, (_, dc) => e.v[r]![dc] === E_LINE),
    ),
  }
}

function freshStats(): SlitherlinkSolveStats {
  return { propagationRounds: 0, forced: 0, guesses: 0, maxDepth: 0, usedBacktracking: false }
}

/**
 * Solve a slitherlink. Counts valid single-loop solutions up to `cap` (so uniqueness
 * can be decided) and records how much work it took, which difficulty grading reads.
 *
 * Strategy: propagate the two local rules to a fixpoint, then branch on a constrained
 * UNKNOWN edge. A branch is closed as soon as a cycle forms — a closed loop can never
 * be extended, so the assignment is a solution iff that loop is the *only* component
 * and every clue is already exactly met; otherwise the branch is dead.
 */
export function solveSlitherlink(
  rows: number,
  cols: number,
  clues: Clue[][],
  cap = 2,
): SlitherlinkSolution {
  const stats = freshStats()
  if (rows <= 0 || cols <= 0) {
    return { status: 'none', loop: null, solutionCount: 0, stats }
  }
  const effectiveCap = Math.max(2, cap)
  let count = 0
  let first: Loop | null = null

  const recurse = (e: Edges, depth: number): void => {
    if (count >= effectiveCap) return
    if (depth > stats.maxDepth) stats.maxDepth = depth
    if (!propagate(e, clues, rows, cols, stats)) return

    const a = analyze(e, rows, cols)
    if (a.contradiction) return

    if (a.closedExists) {
      // A loop has closed. It can only be a solution if it is the whole picture.
      if (a.components !== 1) return
      if (!cluesSatisfied(e, clues, rows, cols)) return
      count++
      if (!first) first = toLoop(e, rows, cols)
      return
    }

    const branch = pickBranch(e, rows, cols)
    if (!branch) return // no UNKNOWN edges and no closed loop → dead end

    stats.usedBacktracking = true
    stats.guesses++
    for (const val of [E_LINE, E_CROSS] as const) {
      if (count >= effectiveCap) break
      const next = cloneEdges(e)
      putE(next, branch, val)
      recurse(next, depth + 1)
    }
  }

  recurse(makeEdges(rows, cols, E_UNKNOWN), 0)

  const status: SolveStatus = count === 0 ? 'none' : count === 1 ? 'unique' : 'multiple'
  return { status, loop: first, solutionCount: count, stats }
}

/* ------------------------------------------------------------------ *
 * Loop helpers (used by the generator, view, and tests)
 * ------------------------------------------------------------------ */

/** Count how many of cell (r,c)'s four edges are on the loop (0–4). */
export function edgesAroundCell(loop: Loop, r: number, c: number): number {
  let n = 0
  if (loop.h[r]![c]) n++
  if (loop.h[r + 1]![c]) n++
  if (loop.v[r]![c]) n++
  if (loop.v[r]![c + 1]) n++
  return n
}

/** Derive the full (no-null) clue grid implied by a loop. */
export function cluesFromLoop(loop: Loop, rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => edgesAroundCell(loop, r, c)),
  )
}

/** Does the loop honour every non-null clue? (Edge count must match exactly.) */
export function loopSatisfiesClues(loop: Loop, clues: Clue[][]): boolean {
  for (let r = 0; r < clues.length; r++) {
    for (let c = 0; c < clues[r]!.length; c++) {
      const k = clues[r]![c]
      if (k == null) continue
      if (edgesAroundCell(loop, r, c) !== k) return false
    }
  }
  return true
}

/**
 * Is `loop` exactly one closed loop? Requires at least one edge, every dot of degree
 * 0 or 2 (no dangling ends, no self-touch / figure-8 pinch), and a single connected
 * component among the line edges.
 */
export function isSingleLoop(loop: Loop, rows: number, cols: number): boolean {
  const nDots = (rows + 1) * (cols + 1)
  const degree = new Int32Array(nDots)
  const parent = new Int32Array(nDots)
  for (let i = 0; i < nDots; i++) parent[i] = i
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  let edges = 0
  for (let dr = 0; dr <= rows; dr++) {
    for (let c = 0; c < cols; c++) {
      if (loop.h[dr]![c]) {
        edges++
        const a = dotId(dr, c, cols)
        const b = dotId(dr, c + 1, cols)
        degree[a]!++
        degree[b]!++
        union(a, b)
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let dc = 0; dc <= cols; dc++) {
      if (loop.v[r]![dc]) {
        edges++
        const a = dotId(r, dc, cols)
        const b = dotId(r + 1, dc, cols)
        degree[a]!++
        degree[b]!++
        union(a, b)
      }
    }
  }

  if (edges === 0) return false
  let root = -1
  for (let id = 0; id < nDots; id++) {
    const d = degree[id]!
    if (d === 0) continue
    if (d !== 2) return false // dangling end or self-touch pinch
    const r = find(id)
    if (root === -1) root = r
    else if (r !== root) return false // a second, disjoint loop
  }
  return true
}

/* ------------------------------------------------------------------ *
 * Difficulty grading
 * ------------------------------------------------------------------ */

/**
 * Grade by what the oracle had to do, mirroring how sudoku splits on technique tier:
 *
 *   • pure propagation (no guessing) → easy / medium, separated by board size and how
 *     many propagation rounds the deductions took (a human feels this as "more to
 *     scan", not "harder reasoning").
 *   • any backtracking → hard / expert, separated by search depth and the (log-scaled)
 *     number of guesses — a human experiences needing trial-and-error as a qualitative
 *     jump, and the very deepest searches spread out the toughest boards.
 *
 * `HARD_BASE` sits above the heaviest pure-logic score so the score stays monotone
 * across the whole ladder. Bands are calibrated against the generator's distribution.
 */
export function gradeSlitherlink(stats: SlitherlinkSolveStats, area = 0): SlitherlinkGrade {
  let score: number
  let difficulty: Difficulty
  if (!stats.usedBacktracking) {
    score = area * 0.4 + stats.propagationRounds * 1.2 + stats.forced * 0.05
    difficulty = score < 28 ? 'easy' : 'medium'
  } else {
    const HARD_BASE = 60
    score =
      HARD_BASE +
      Math.log2(1 + stats.guesses) * 3 +
      stats.maxDepth * 2.5 +
      stats.propagationRounds * 0.3
    difficulty = score < 110 ? 'hard' : 'expert'
  }
  return { score: Math.round(score * 100) / 100, difficulty }
}

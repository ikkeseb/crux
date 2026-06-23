import type { SudokuGrid } from './types'

/**
 * Human-technique sudoku engine.
 *
 * Solves a board the way a person does — by repeatedly applying the cheapest
 * applicable deduction from a ladder of named techniques and recording each as a
 * {@link SolveStep}. The *hardest* technique a board forces is what
 * {@link gradeSudoku} grades on, and the recorded steps (with human-readable
 * reasons) drive the teaching hints in the player view.
 *
 * This engine never decides uniqueness — DLX (`countSolutions`) remains the
 * oracle for that. It only reads a board and reasons about it; on any
 * proper (unique) puzzle every deduction it makes is sound, which the
 * solver-as-oracle property test pins down against the DLX solution.
 */

export const FULL_MASK = 0x3fe // bits 1..9 set

export type Technique =
  | 'naked-single'
  | 'hidden-single'
  | 'locked-candidates'
  | 'naked-pair'
  | 'naked-triple'
  | 'hidden-pair'
  | 'hidden-triple'
  | 'x-wing'
  | 'xy-wing'

/** Ladder rank — higher is harder. Difficulty grades on the max rank a board forces. */
export const TECHNIQUE_TIER: Record<Technique, number> = {
  'naked-single': 1,
  'hidden-single': 1,
  'locked-candidates': 2,
  'naked-pair': 3,
  'naked-triple': 3,
  'hidden-pair': 3,
  'hidden-triple': 3,
  'x-wing': 4,
  'xy-wing': 4,
}

export interface Cell {
  r: number
  c: number
}
export interface Placement {
  r: number
  c: number
  d: number
}
export interface Elimination {
  r: number
  c: number
  d: number
}

export interface SolveStep {
  technique: Technique
  /** Digits placed by this step (singles). */
  placements: Placement[]
  /** Candidates removed by this step (everything above singles). */
  eliminations: Elimination[]
  /** Human-readable explanation, in RnCn notation. */
  reason: string
  /** Cells forming the evidence for this deduction (for hint highlighting). */
  highlights: Cell[]
}

export interface TechniqueSolveResult {
  solved: boolean
  steps: SolveStep[]
  /** Hardest technique used, or null if the board needed no steps. */
  hardest: Technique | null
  /** Board state when solved or stuck. */
  grid: SudokuGrid
}

/** Mutable working state: placed digits plus a candidate bitmask per empty cell. */
export interface State {
  grid: number[][]
  /** Bits 1..9 for empty cells; 0 for filled cells. */
  cand: number[][]
}

/* ---- bit helpers --------------------------------------------------------- */

const bit = (d: number): number => 1 << d

const popcount = (x: number): number => {
  let n = 0
  let v = x
  while (v) {
    v &= v - 1
    n++
  }
  return n
}

/** Digit of a single-bit mask. */
const onlyDigit = (mask: number): number => 31 - Math.clz32(mask)

/** All digits (1..9) set in a mask, ascending. */
const digitsOf = (mask: number): number[] => {
  const ds: number[] = []
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) ds.push(d)
  return ds
}

/* ---- geometry (units, peers) precomputed once ---------------------------- */

const boxOf = (r: number, c: number): number => Math.floor(r / 3) * 3 + Math.floor(c / 3)

interface Unit {
  cells: Cell[]
  label: string
  kind: 'row' | 'col' | 'box'
}

const UNITS: Unit[] = (() => {
  const units: Unit[] = []
  for (let r = 0; r < 9; r++) {
    units.push({
      kind: 'row',
      label: `row ${r + 1}`,
      cells: Array.from({ length: 9 }, (_, c) => ({ r, c })),
    })
  }
  for (let c = 0; c < 9; c++) {
    units.push({
      kind: 'col',
      label: `column ${c + 1}`,
      cells: Array.from({ length: 9 }, (_, r) => ({ r, c })),
    })
  }
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3
    const bc = (b % 3) * 3
    const cells: Cell[] = []
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push({ r: br + i, c: bc + j })
    units.push({ kind: 'box', label: `box ${b + 1}`, cells })
  }
  return units
})()

const BOX_UNITS: Unit[] = UNITS.filter((u) => u.kind === 'box')
const ROW_UNITS: Unit[] = UNITS.filter((u) => u.kind === 'row')
const COL_UNITS: Unit[] = UNITS.filter((u) => u.kind === 'col')

/** Peer index set per cell (the 20 cells sharing a row, column, or box). */
const PEERS: Set<number>[][] = (() => {
  const peers: Set<number>[][] = []
  for (let r = 0; r < 9; r++) {
    const row: Set<number>[] = []
    for (let c = 0; c < 9; c++) {
      const s = new Set<number>()
      for (let k = 0; k < 9; k++) {
        if (k !== c) s.add(r * 9 + k)
        if (k !== r) s.add(k * 9 + c)
      }
      const br = Math.floor(r / 3) * 3
      const bc = Math.floor(c / 3) * 3
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const pr = br + i
          const pc = bc + j
          if (pr !== r || pc !== c) s.add(pr * 9 + pc)
        }
      }
      row.push(s)
    }
    peers.push(row)
  }
  return peers
})()

const idx = (r: number, c: number): number => r * 9 + c

/* ---- state construction -------------------------------------------------- */

function candidateMask(grid: number[][], r: number, c: number): number {
  let used = 0
  for (let k = 0; k < 9; k++) {
    used |= bit(grid[r][k])
    used |= bit(grid[k][c])
  }
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) used |= bit(grid[br + i][bc + j])
  return FULL_MASK & ~used
}

/** Build a working state from a (partial) grid, computing candidates honestly. */
export function makeState(grid: SudokuGrid): State {
  const g = grid.map((row) => row.slice())
  const cand: number[][] = Array.from({ length: 9 }, () => new Array<number>(9).fill(0))
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (g[r][c] === 0) cand[r][c] = candidateMask(g, r, c)
    }
  }
  return { grid: g, cand }
}

const label = (r: number, c: number): string => `R${r + 1}C${c + 1}`

function place(s: State, r: number, c: number, d: number): void {
  s.grid[r][c] = d
  s.cand[r][c] = 0
  for (const p of PEERS[r][c]) {
    s.cand[Math.floor(p / 9)][p % 9] &= ~bit(d)
  }
}

function applyStep(s: State, step: SolveStep): void {
  for (const e of step.eliminations) s.cand[e.r][e.c] &= ~bit(e.d)
  for (const p of step.placements) place(s, p.r, p.c, p.d)
}

function isSolved(s: State): boolean {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (s.grid[r][c] === 0) return false
  return true
}

/** Is digit `d` already placed somewhere in `unit`? */
function placedInUnit(s: State, unit: Unit, d: number): boolean {
  for (const { r, c } of unit.cells) if (s.grid[r][c] === d) return true
  return false
}

/* ---- combinations (small k over small arrays) ---------------------------- */

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  const n = arr.length
  if (k > n || k <= 0) return
  const sel = Array.from({ length: k }, (_, i) => i)
  for (;;) {
    yield sel.map((i) => arr[i])
    let i = k - 1
    while (i >= 0 && sel[i] === n - k + i) i--
    if (i < 0) break
    sel[i]++
    for (let j = i + 1; j < k; j++) sel[j] = sel[j - 1] + 1
  }
}

/* ---- techniques ---------------------------------------------------------- */
/* Each returns the first deduction it can make, or null. A returned step always
 * makes real progress (places a digit or removes at least one live candidate). */

export function findNakedSingle(s: State): SolveStep | null {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (s.grid[r][c] !== 0) continue
      if (popcount(s.cand[r][c]) === 1) {
        const d = onlyDigit(s.cand[r][c])
        return {
          technique: 'naked-single',
          placements: [{ r, c, d }],
          eliminations: [],
          reason: `${label(r, c)} = ${d}: naked single — only candidate left in the cell`,
          highlights: [{ r, c }],
        }
      }
    }
  }
  return null
}

export function findHiddenSingle(s: State): SolveStep | null {
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      if (placedInUnit(s, unit, d)) continue
      let home: Cell | null = null
      let count = 0
      for (const { r, c } of unit.cells) {
        if (s.grid[r][c] === 0 && s.cand[r][c] & bit(d)) {
          home = { r, c }
          count++
          if (count > 1) break
        }
      }
      if (count === 1 && home) {
        return {
          technique: 'hidden-single',
          placements: [{ r: home.r, c: home.c, d }],
          eliminations: [],
          reason: `${label(home.r, home.c)} = ${d}: hidden single — only spot for ${d} in ${unit.label}`,
          highlights: unit.cells.slice(),
        }
      }
    }
  }
  return null
}

export function findLockedCandidates(s: State): SolveStep | null {
  // Pointing: a digit confined to one line within a box → remove from rest of that line.
  for (const box of BOX_UNITS) {
    for (let d = 1; d <= 9; d++) {
      if (placedInUnit(s, box, d)) continue
      const homes = box.cells.filter(({ r, c }) => s.grid[r][c] === 0 && s.cand[r][c] & bit(d))
      if (homes.length < 2) continue
      const rows = new Set(homes.map((h) => h.r))
      const cols = new Set(homes.map((h) => h.c))
      if (rows.size === 1) {
        const r = homes[0].r
        const elims: Elimination[] = []
        for (let c = 0; c < 9; c++) {
          if (boxOf(r, c) === boxOf(r, homes[0].c)) continue
          if (s.grid[r][c] === 0 && s.cand[r][c] & bit(d)) elims.push({ r, c, d })
        }
        if (elims.length) {
          return {
            technique: 'locked-candidates',
            placements: [],
            eliminations: elims,
            reason: `${d} in ${box.label} is locked to row ${r + 1} → removed ${d} from ${elims.length} cell(s) in that row`,
            highlights: homes,
          }
        }
      }
      if (cols.size === 1) {
        const c = homes[0].c
        const elims: Elimination[] = []
        for (let r = 0; r < 9; r++) {
          if (boxOf(r, c) === boxOf(homes[0].r, c)) continue
          if (s.grid[r][c] === 0 && s.cand[r][c] & bit(d)) elims.push({ r, c, d })
        }
        if (elims.length) {
          return {
            technique: 'locked-candidates',
            placements: [],
            eliminations: elims,
            reason: `${d} in ${box.label} is locked to column ${c + 1} → removed ${d} from ${elims.length} cell(s) in that column`,
            highlights: homes,
          }
        }
      }
    }
  }
  // Claiming: a digit confined to one box within a line → remove from rest of that box.
  for (const line of [...ROW_UNITS, ...COL_UNITS]) {
    for (let d = 1; d <= 9; d++) {
      if (placedInUnit(s, line, d)) continue
      const homes = line.cells.filter(({ r, c }) => s.grid[r][c] === 0 && s.cand[r][c] & bit(d))
      if (homes.length < 2) continue
      const boxes = new Set(homes.map((h) => boxOf(h.r, h.c)))
      if (boxes.size !== 1) continue
      const b = boxOf(homes[0].r, homes[0].c)
      const elims: Elimination[] = []
      for (const { r, c } of BOX_UNITS[b].cells) {
        const inLine = line.cells.some((cell) => cell.r === r && cell.c === c)
        if (inLine) continue
        if (s.grid[r][c] === 0 && s.cand[r][c] & bit(d)) elims.push({ r, c, d })
      }
      if (elims.length) {
        return {
          technique: 'locked-candidates',
          placements: [],
          eliminations: elims,
          reason: `${d} in ${line.label} is confined to ${BOX_UNITS[b].label} → removed ${d} from ${elims.length} cell(s) in that box`,
          highlights: homes,
        }
      }
    }
  }
  return null
}

export function findNakedSubset(s: State, size: 2 | 3): SolveStep | null {
  const technique: Technique = size === 2 ? 'naked-pair' : 'naked-triple'
  for (const unit of UNITS) {
    const open = unit.cells.filter(({ r, c }) => {
      const n = popcount(s.cand[r][c])
      return s.grid[r][c] === 0 && n >= 2 && n <= size
    })
    if (open.length < size) continue
    for (const combo of combinations(open, size)) {
      let union = 0
      for (const { r, c } of combo) union |= s.cand[r][c]
      if (popcount(union) !== size) continue
      const inCombo = new Set(combo.map((cell) => idx(cell.r, cell.c)))
      const elims: Elimination[] = []
      for (const { r, c } of unit.cells) {
        if (s.grid[r][c] !== 0 || inCombo.has(idx(r, c))) continue
        for (const d of digitsOf(s.cand[r][c] & union)) elims.push({ r, c, d })
      }
      if (elims.length) {
        return {
          technique,
          placements: [],
          eliminations: elims,
          reason: `naked ${size === 2 ? 'pair' : 'triple'} (${digitsOf(union).join('')}) in ${unit.label} → removed ${elims.length} candidate(s)`,
          highlights: combo,
        }
      }
    }
  }
  return null
}

export function findHiddenSubset(s: State, size: 2 | 3): SolveStep | null {
  const technique: Technique = size === 2 ? 'hidden-pair' : 'hidden-triple'
  for (const unit of UNITS) {
    // Digits unplaced in the unit, with their candidate home cells.
    const homesByDigit = new Map<number, Cell[]>()
    for (let d = 1; d <= 9; d++) {
      if (placedInUnit(s, unit, d)) continue
      const homes = unit.cells.filter(({ r, c }) => s.grid[r][c] === 0 && s.cand[r][c] & bit(d))
      if (homes.length >= 2 && homes.length <= size) homesByDigit.set(d, homes)
    }
    const digits = [...homesByDigit.keys()]
    if (digits.length < size) continue
    for (const combo of combinations(digits, size)) {
      const cellSet = new Set<number>()
      for (const d of combo) for (const h of homesByDigit.get(d)!) cellSet.add(idx(h.r, h.c))
      if (cellSet.size !== size) continue
      let keep = 0
      for (const d of combo) keep |= bit(d)
      const elims: Elimination[] = []
      const cells: Cell[] = []
      for (const id of cellSet) {
        const r = Math.floor(id / 9)
        const c = id % 9
        cells.push({ r, c })
        for (const d of digitsOf(s.cand[r][c] & ~keep)) elims.push({ r, c, d })
      }
      if (elims.length) {
        return {
          technique,
          placements: [],
          eliminations: elims,
          reason: `hidden ${size === 2 ? 'pair' : 'triple'} (${combo.join('')}) in ${unit.label} → stripped ${elims.length} other candidate(s)`,
          highlights: cells,
        }
      }
    }
  }
  return null
}

export function findXWing(s: State): SolveStep | null {
  for (let d = 1; d <= 9; d++) {
    // Row-based: two rows where d sits in exactly the same two columns.
    const rowSpots: Array<{ line: number; spots: number[] }> = []
    for (let r = 0; r < 9; r++) {
      const cols: number[] = []
      for (let c = 0; c < 9; c++) if (s.grid[r][c] === 0 && s.cand[r][c] & bit(d)) cols.push(c)
      if (cols.length === 2) rowSpots.push({ line: r, spots: cols })
    }
    const rowStep = fishFrom(s, d, rowSpots, 'row')
    if (rowStep) return rowStep

    // Column-based: two columns where d sits in exactly the same two rows.
    const colSpots: Array<{ line: number; spots: number[] }> = []
    for (let c = 0; c < 9; c++) {
      const rows: number[] = []
      for (let r = 0; r < 9; r++) if (s.grid[r][c] === 0 && s.cand[r][c] & bit(d)) rows.push(r)
      if (rows.length === 2) colSpots.push({ line: c, spots: rows })
    }
    const colStep = fishFrom(s, d, colSpots, 'col')
    if (colStep) return colStep
  }
  return null
}

/** X-wing helper: given candidate lines (each with exactly two cross-positions), find a pair. */
function fishFrom(
  s: State,
  d: number,
  lines: Array<{ line: number; spots: number[] }>,
  orient: 'row' | 'col',
): SolveStep | null {
  for (const [a, b] of combinations(lines, 2)) {
    if (a.spots[0] !== b.spots[0] || a.spots[1] !== b.spots[1]) continue
    const [p, q] = a.spots
    const elims: Elimination[] = []
    const corners: Cell[] = []
    if (orient === 'row') {
      corners.push(
        { r: a.line, c: p },
        { r: a.line, c: q },
        { r: b.line, c: p },
        { r: b.line, c: q },
      )
      for (let r = 0; r < 9; r++) {
        if (r === a.line || r === b.line) continue
        for (const c of [p, q]) {
          if (s.grid[r][c] === 0 && s.cand[r][c] & bit(d)) elims.push({ r, c, d })
        }
      }
    } else {
      corners.push(
        { r: p, c: a.line },
        { r: q, c: a.line },
        { r: p, c: b.line },
        { r: q, c: b.line },
      )
      for (let c = 0; c < 9; c++) {
        if (c === a.line || c === b.line) continue
        for (const r of [p, q]) {
          if (s.grid[r][c] === 0 && s.cand[r][c] & bit(d)) elims.push({ r, c, d })
        }
      }
    }
    if (elims.length) {
      return {
        technique: 'x-wing',
        placements: [],
        eliminations: elims,
        reason: `X-wing on ${d} (${orient === 'row' ? 'rows' : 'columns'} ${a.line + 1} & ${b.line + 1}) → removed ${d} from ${elims.length} cell(s)`,
        highlights: corners,
      }
    }
  }
  return null
}

export function findXyWing(s: State): SolveStep | null {
  // Bivalue pivot {x,y}; pincers {x,z} and {y,z} both peers of the pivot; z dies
  // in every cell seeing both pincers.
  const bivalue: Cell[] = []
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (s.grid[r][c] === 0 && popcount(s.cand[r][c]) === 2) bivalue.push({ r, c })
    }
  }
  for (const pivot of bivalue) {
    const pv = s.cand[pivot.r][pivot.c]
    const pincers = bivalue.filter(
      (cell) =>
        PEERS[pivot.r][pivot.c].has(idx(cell.r, cell.c)) &&
        popcount(s.cand[cell.r][cell.c] & pv) === 1,
    )
    for (const [p1, p2] of combinations(pincers, 2)) {
      const a = s.cand[p1.r][p1.c]
      const b = s.cand[p2.r][p2.c]
      const sharedA = a & pv
      const sharedB = b & pv
      if (sharedA === sharedB) continue // both pincers grab the same pivot digit
      const common = a & b & ~pv
      if (popcount(common) !== 1) continue
      const z = onlyDigit(common)
      const elims: Elimination[] = []
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const id = idx(r, c)
          if (id === idx(pivot.r, pivot.c) || id === idx(p1.r, p1.c) || id === idx(p2.r, p2.c))
            continue
          if (s.grid[r][c] !== 0 || !(s.cand[r][c] & bit(z))) continue
          if (PEERS[p1.r][p1.c].has(id) && PEERS[p2.r][p2.c].has(id)) elims.push({ r, c, d: z })
        }
      }
      if (elims.length) {
        return {
          technique: 'xy-wing',
          placements: [],
          eliminations: elims,
          reason: `XY-wing: pivot ${label(pivot.r, pivot.c)}, pincers ${label(p1.r, p1.c)}/${label(p2.r, p2.c)} → removed ${z} from ${elims.length} cell(s)`,
          highlights: [pivot, p1, p2],
        }
      }
    }
  }
  return null
}

/* ---- the ladder ---------------------------------------------------------- */

const LADDER: Array<(s: State) => SolveStep | null> = [
  findNakedSingle,
  findHiddenSingle,
  findLockedCandidates,
  (s) => findNakedSubset(s, 2),
  (s) => findHiddenSubset(s, 2),
  (s) => findNakedSubset(s, 3),
  (s) => findHiddenSubset(s, 3),
  findXWing,
  findXyWing,
]

/**
 * Solve as far as the technique ladder allows, recording every step. Stops when
 * the board is solved or no technique applies (the board then needs reasoning
 * beyond the ladder — graded `expert`).
 */
export function solveByTechniques(grid: SudokuGrid): TechniqueSolveResult {
  const s = makeState(grid)
  const steps: SolveStep[] = []
  outer: for (;;) {
    if (isSolved(s)) break
    for (const technique of LADDER) {
      const step = technique(s)
      if (step) {
        applyStep(s, step)
        steps.push(step)
        continue outer
      }
    }
    break // stuck — beyond the ladder
  }
  let hardest: Technique | null = null
  let best = 0
  for (const step of steps) {
    const t = TECHNIQUE_TIER[step.technique]
    if (t > best) {
      best = t
      hardest = step.technique
    }
  }
  return { solved: isSolved(s), steps, hardest, grid: s.grid }
}

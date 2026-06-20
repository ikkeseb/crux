# Sudoku technique-based grading + teaching hints

**Status:** grading **implemented** · teaching hints **pending** · 2026-06-20

## Status notes

- **Done:** the technique engine (`src/sudoku/techniques.ts`), the `gradeSudoku`
  rewrite, generator re-tuning, and the full test suite (incl. the DLX-oracle
  soundness property test). Gate green: typecheck · 76 tests · build. Honour rate
  probed at 12/12 per difficulty.
- **Pending (next session):** wire the technique trace into the sudoku view hint
  (`src/ui/sudoku-view.ts`) — run `solveByTechniques` from the player's current
  state, surface `step.reason`, and flash `step.highlights`. The engine already
  emits everything the hint needs; this is UI-only work. See "Hints" below.

## Problem

Today `gradeSudoku` measures difficulty by DLX search effort (recursion `nodes`).
That tracks how hard the *machine's* brute-force works, not how hard a *human* finds
the puzzle. "Many DLX nodes" does not mean "hard for a person". The project's soul is
*solver-as-oracle*; difficulty should be graded by human-recognizable reasoning, not
machine search.

## Goal

Grade a sudoku by the **hardest human technique required to solve it**, and reuse the
same reasoning engine to power **teaching hints** that explain *why* a digit is forced.

One new engine, two consumers:
- `gradeSudoku` → difficulty tier from the hardest technique used.
- Sudoku view hint → next deduction + human-readable reason.

DLX stays the oracle for **uniqueness**. The technique engine never touches the
generator's uniqueness guarantee — it only reads boards and reasons about them.

## The technique engine — `src/sudoku/techniques.ts`

A candidate-propagation solver over a `Candidates` state (per empty cell, a 9-bit
mask of possible digits). It repeatedly finds the **cheapest applicable technique**,
applies **one** deduction, records a `SolveStep`, and repeats until solved or stuck.

### Technique ladder (cheap → expensive)

| Tier | Technique | Effect |
|------|-----------|--------|
| 1 | `naked-single` | cell with one candidate → place it |
| 1 | `hidden-single` | digit with one home in a unit → place it |
| 2 | `locked-candidates` | digit in a box confined to one line (pointing), or in a line confined to one box (claiming) → eliminate elsewhere |
| 3 | `naked-pair`, `naked-triple` | N cells in a unit share exactly N candidates → eliminate those digits from the rest of the unit |
| 3 | `hidden-pair`, `hidden-triple` | N digits confined to N cells in a unit → strip other candidates from those cells |
| 4 | `x-wing` | a digit forming a rectangle across two rows/cols → eliminate along the cross-lines |
| 4 | `xy-wing` | bivalue pivot + two pincers → eliminate the shared digit from common peers |

If the engine stalls before solving, the puzzle is beyond the ladder → graded
`expert` (still unique by DLX construction). The exact ladder ceiling (xy-wing vs
adding swordfish/chains) is chosen empirically to give a clean difficulty spread;
xy-wing is the planned ceiling, extended only if the distribution needs it.

### Types

```ts
type Technique =
  | 'naked-single' | 'hidden-single' | 'locked-candidates'
  | 'naked-pair' | 'naked-triple' | 'hidden-pair' | 'hidden-triple'
  | 'x-wing' | 'xy-wing'

interface SolveStep {
  technique: Technique
  placements: { r: number; c: number; d: number }[]   // digits placed
  eliminations: { r: number; c: number; d: number }[] // candidates removed
  reason: string                                       // "R3C5 = 7: hidden single in box 4"
  highlights: { r: number; c: number }[]              // evidence cells
}

interface TechniqueSolveResult {
  solved: boolean
  steps: SolveStep[]
  hardest: Technique | null   // null if zero steps were needed / possible
  grid: SudokuGrid            // state when solved or stuck
}
```

`solveByTechniques(grid): TechniqueSolveResult` is the single entry point.

## Grading — `gradeSudoku` rewrite

Map the hardest technique to a tier, then to a difficulty:

- only singles → `easy` / `medium` (split by empties / step count)
- up to `locked-candidates` → `medium` / `hard`
- subsets (`naked/hidden pair/triple`) → `hard`
- fish/wings (`x-wing`, `xy-wing`) or stalled → `expert`

`score` stays a continuous number for resampling tie-breaks: tier weight (dominant)
+ small contributions from empties and count of advanced steps. Thresholds tuned
empirically against the seed distribution.

`SudokuGrade` gains `hardest: Technique | null` (and keeps `nodes`, `givens`,
`logicSolvable` for continuity). Generator keeps resampling to honour requested
difficulty; `TARGET_GIVENS` re-tuned so each tier is reachable.

## Hints — `src/ui/sudoku-view.ts`

1. Wrong-entry check first (compare to `puzzle.solution`) — unchanged behaviour.
2. Else run `solveByTechniques` from the **player's current values**, take the first
   step, place its digit (if a placement) or highlight the eliminated candidates,
   and surface `step.reason` via the status line.
3. If the engine stalls, fall back to placing the solution cell with a generic note.

## Correctness — solver-as-oracle

The load-bearing invariant, testable against the DLX solution of any generated board:

> Every `placement` equals the solution digit at that cell, and every `elimination`
> removes a digit that is **not** the solution digit there.

A buggy technique that wrongly eliminates a true candidate is caught immediately by
this property across N generated puzzles. Plus:

- **Per-technique unit tests** — hand-built boards where one technique fires, asserting
  the exact placement/elimination.
- **Distribution / honour-difficulty tests** — generator produces the requested tier
  for most seeds across all four difficulties.
- **Adversarial review workflow** over the technique logic before commit.

## Files touched

- `src/sudoku/techniques.ts` (new) + `techniques.test.ts` (new)
- `src/sudoku/types.ts` — add `Technique`, `SolveStep`, `TechniqueSolveResult`, `hardest`
- `src/sudoku/solver.ts` — `gradeSudoku` uses the engine (DLX still for uniqueness)
- `src/sudoku/generator.ts` — re-tune `TARGET_GIVENS`
- `src/ui/sudoku-view.ts` — technique-powered hints with reasons

## Commits

1. Technique engine + grading rewrite + tuning (with full test suite).
2. Teaching hints wired into the sudoku view.

## Invariants held

Seeded/deterministic generation · solver-as-oracle for uniqueness (DLX) · zero runtime
deps · XSS-safe DOM · English code/docs/commits.

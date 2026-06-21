# crux

Client-side logic-puzzle game — **nonogram, sudoku, sokoban, slitherlink**. TypeScript
(strict) + Vite, pnpm, static, no backend, **zero runtime dependencies**.

## Core principle: the solver is the oracle

Each puzzle type ships a **solver**, a **generator**, and a player **view**. Generators
lean on the solver to guarantee quality, never the other way around:

- **nonogram** — per-line constraint-propagation DP + backtracking → **unique** solution
- **sudoku** — DLX (dancing links) exact cover, counts solutions to 2 → **unique**
- **sokoban** — A\* over `(boxes, normalized-player)` + simple-deadlock pruning; levels
  built by reverse-pull from a solved state → **solvable by construction**
- **slitherlink** — edge constraint-propagation (clue + dot rules) + backtracking, counts
  solutions to 2 → **unique**; loops built as the boundary of a random simply-connected
  region (holes filled, diagonal pinches repaired so the boundary is one simple loop)

All generation is **seeded and deterministic** (`src/lib/rng.ts`, mulberry32 + xmur3).
Difficulty is **graded by solver search effort**; generators resample to honour a
requested difficulty, and `puzzle.difficulty` is always the honest grade returned.

## Commands

```
pnpm dev         # dev server (http://localhost:5173)
pnpm typecheck   # tsc --noEmit (strict)
pnpm test        # Vitest: unit + property + difficulty
pnpm build       # tsc --noEmit && vite build
pnpm screens     # Playwright → /screens (port 4319, never reuses a foreign server)
```

**Gate before every commit:** `pnpm typecheck && pnpm test && pnpm build` all green.

## Layout

```
src/lib/                                 seeded RNG, daily-seed, shared types
src/{nonogram,sudoku,sokoban,slitherlink} types · solver · generator (+ *.test.ts)
src/ui/                                  dom helpers · app shell · one view per puzzle type
tests/e2e/                    Playwright screenshot + interaction checks
screens/                      generated screenshots (deliverable)
```

## Conventions

- TS strict. Code, docs, and commits in **English**.
- UI builds DOM via `src/ui/dom.ts` (`el`/`clear`) — **never `innerHTML` for dynamic
  content** (XSS-safe by construction).
- Each solver has: unit tests (known boards → known solutions), property tests
  (generate N → solver confirms solvable/unique), and difficulty-grading sanity.
- Solvers are the load-bearing correctness surface — change them only with tests, and
  adversarially verify uniqueness/solvability claims.
- Verify before claiming done: run the gate and show its output.

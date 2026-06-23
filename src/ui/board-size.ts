/**
 * One shared board-sizing model so every puzzle type lands on a consistent
 * footprint inside the fixed board stage — the single source of truth for
 * "how big should a cell be".
 *
 * Each view describes its geometry as a *pitch count*: how many cell-widths the
 * whole footprint spans on each axis, including the non-cell chrome around the
 * grid (nonogram clue gutters, slitherlink dots, sokoban gaps) expressed in
 * cell-pitch units. We size one cell so the *limiting* axis fills the shared
 * `--board-box` length; `min`/`max` keep cells sane at the extremes (a 5×5 stays
 * crisp, a 20×15 stays legible). The `max` is tuned so even the smallest grid of
 * each type nearly fills the box, so boards stay a consistent size across types.
 *
 * The result is a CSS `clamp()` string, not a number: all responsiveness lives
 * in the single `--board-box` custom property (set in style.css, viewport-driven),
 * so a media query never has to reach an inline-styled cell, and every board on
 * screen divides the exact same length.
 *
 * The per-type `fit*` helpers below own the load-bearing pitch formulas (and are
 * unit-tested), so the views just declare their geometry.
 */
export interface BoardFit {
  cols: number
  rows: number
  /** Extra footprint along x / y in cell-pitch units (clue gutters, dots, gaps). */
  padCols?: number
  padRows?: number
  /** px clamp on the resulting cell (or edge) length. */
  min: number
  max: number
}

/** Build the `--cell` / `--len` value: `--board-box` divided by the limiting axis. */
export function fitCell(f: BoardFit): string {
  const unitsX = f.cols + (f.padCols ?? 0)
  const unitsY = f.rows + (f.padRows ?? 0)
  // Round so the generated string stays stable and unit-testable.
  const units = Math.round(Math.max(unitsX, unitsY) * 100) / 100
  return `clamp(${f.min}px, calc(var(--board-box) / ${units}), ${f.max}px)`
}

/** Sudoku is always 9×9 with no surrounding chrome. */
export function fitSudoku(): string {
  return fitCell({ cols: 9, rows: 9, min: 30, max: 62 })
}

/** Sokoban: a small allowance for the 2px tile gaps + padding. */
export function fitSokoban(cols: number, rows: number): string {
  return fitCell({ cols, rows, padCols: 0.4, padRows: 0.4, min: 18, max: 66 })
}

/**
 * Nonogram: the clue gutters are `auto` tracks, so reserve their footprint in
 * cell-pitch units (≈0.55 per clue number, min 2) — that keeps the *whole* board
 * (gutter + grid) filling --board-box rather than just the playable grid.
 */
export function fitNonogram(
  width: number,
  height: number,
  longestRowClue: number,
  longestColClue: number,
): string {
  return fitCell({
    cols: width,
    rows: height,
    padCols: Math.max(2, longestRowClue * 0.55),
    padRows: Math.max(2, longestColClue * 0.55),
    min: 16,
    max: 72,
  })
}

/**
 * Slitherlink: a cell pitch is len + dot (dot = 0.34·len), plus an outer dot and
 * the board's edge padding — fold all of that into the pitch units so the loop's
 * footprint matches the other puzzles' boards.
 */
export function fitSlitherlink(cols: number, rows: number): string {
  return fitCell({
    cols,
    rows,
    padCols: cols * 0.34 + 0.68,
    padRows: rows * 0.34 + 0.68,
    min: 22,
    max: 66,
  })
}

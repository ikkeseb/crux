import { describe, it, expect } from 'vitest'
import { fitCell, fitNonogram, fitSlitherlink, fitSokoban, fitSudoku } from './board-size'

describe('fitCell', () => {
  it('divides the shared board box by the limiting axis', () => {
    expect(fitCell({ cols: 9, rows: 9, min: 34, max: 60 })).toBe(
      'clamp(34px, calc(var(--board-box) / 9), 60px)',
    )
  })

  it('reserves pad units (clue gutter) as extra footprint', () => {
    expect(fitCell({ cols: 5, rows: 5, padCols: 2, padRows: 2, min: 16, max: 46 })).toBe(
      'clamp(16px, calc(var(--board-box) / 7), 46px)',
    )
  })

  it('picks the wider axis on a rectangular board', () => {
    // x: 20 + 3 = 23 dominates y: 15 + 3 = 18
    expect(fitCell({ cols: 20, rows: 15, padCols: 3, padRows: 3, min: 16, max: 46 })).toBe(
      'clamp(16px, calc(var(--board-box) / 23), 46px)',
    )
  })

  it('rounds fractional pitch units to two decimals for a stable string', () => {
    expect(fitCell({ cols: 5, rows: 5, padCols: 1.345, padRows: 0, min: 10, max: 20 })).toBe(
      'clamp(10px, calc(var(--board-box) / 6.35), 20px)',
    )
  })
})

// These guard the load-bearing per-type pitch formulas (a regression in any one
// changes the generated string), and check that the smallest grid of each type
// is capped while a large grid is box-limited — the "consistent footprint" goal.
describe('per-type fits', () => {
  it('sudoku is a fixed 9×9', () => {
    expect(fitSudoku()).toBe('clamp(30px, calc(var(--board-box) / 9), 62px)')
  })

  it('sokoban folds the tile gaps into ~0.4 pitch units', () => {
    // easy 7×6 → max axis 7 + 0.4 = 7.4 (small grid, capped at 66)
    expect(fitSokoban(7, 6)).toBe('clamp(18px, calc(var(--board-box) / 7.4), 66px)')
    // expert 10×9 → 10.4 (box-limited)
    expect(fitSokoban(10, 9)).toBe('clamp(18px, calc(var(--board-box) / 10.4), 66px)')
  })

  it('nonogram reserves clue gutters (≥2, else 0.55 per clue number)', () => {
    // easy 5×5, short clues → gutter floored at 2 → 5 + 2 = 7
    expect(fitNonogram(5, 5, 2, 2)).toBe('clamp(16px, calc(var(--board-box) / 7), 72px)')
    // hard 15×15 with a 5-number clue → 15 + round(5*0.55,2)=2.75 → 17.75
    expect(fitNonogram(15, 15, 5, 5)).toBe('clamp(16px, calc(var(--board-box) / 17.75), 72px)')
  })

  it('slitherlink folds dots + padding into the pitch (cols·1.34 + 0.68)', () => {
    // easy 5×5 → 5 + (5*0.34 + 0.68) = 5 + 2.38 = 7.38
    expect(fitSlitherlink(5, 5)).toBe('clamp(22px, calc(var(--board-box) / 7.38), 66px)')
    // hard 7×7 → 7 + (7*0.34 + 0.68) = 7 + 3.06 = 10.06
    expect(fitSlitherlink(7, 7)).toBe('clamp(22px, calc(var(--board-box) / 10.06), 66px)')
  })
})

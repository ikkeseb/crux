import { describe, it, expect } from 'vitest'
import { dateKey, dailySeed } from './daily'
import { Rng } from './rng'

describe('daily seed', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 5, 20))).toBe('2026-06-20')
    expect(dateKey(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(dateKey(new Date(2026, 11, 9))).toBe('2026-12-09')
  })

  it('is stable per (puzzle, day) and varies across both', () => {
    const day = new Date(2026, 5, 20)
    expect(dailySeed('nonogram', day)).toBe('crux:nonogram:2026-06-20')
    expect(dailySeed('nonogram', day)).toBe(dailySeed('nonogram', day))
    expect(dailySeed('nonogram', day)).not.toBe(dailySeed('sudoku', day))
    expect(dailySeed('nonogram', day)).not.toBe(
      dailySeed('nonogram', new Date(2026, 5, 21)),
    )
  })

  it('feeds a usable, deterministic Rng', () => {
    const seed = dailySeed('sokoban', new Date(2026, 5, 20))
    const a = new Rng(seed).int(1_000_000)
    const b = new Rng(seed).int(1_000_000)
    expect(a).toBe(b)
  })
})

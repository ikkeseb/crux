import { describe, expect, test } from 'vitest'
import { computeStreak } from './streak'

describe('computeStreak', () => {
  test('no completions is a zero streak', () => {
    expect(computeStreak([], '2026-06-21')).toEqual({ current: 0, longest: 0 })
  })

  test('only today gives a current streak of one', () => {
    expect(computeStreak(['2026-06-21'], '2026-06-21')).toEqual({ current: 1, longest: 1 })
  })

  test('counts back through consecutive days ending today', () => {
    const dates = ['2026-06-19', '2026-06-20', '2026-06-21']
    expect(computeStreak(dates, '2026-06-21')).toEqual({ current: 3, longest: 3 })
  })

  test('a gap before today resets the current streak to the recent run', () => {
    const dates = ['2026-06-10', '2026-06-20', '2026-06-21']
    expect(computeStreak(dates, '2026-06-21')).toEqual({ current: 2, longest: 2 })
  })

  test('streak stays alive when yesterday is done but today is not yet', () => {
    // You completed through yesterday; today is still open to extend it.
    const dates = ['2026-06-19', '2026-06-20']
    expect(computeStreak(dates, '2026-06-21')).toEqual({ current: 2, longest: 2 })
  })

  test('missing both today and yesterday breaks the current streak', () => {
    const dates = ['2026-06-18', '2026-06-19']
    expect(computeStreak(dates, '2026-06-21')).toEqual({ current: 0, longest: 2 })
  })

  test('longest tracks the best run even when the current streak is shorter', () => {
    const dates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-21']
    expect(computeStreak(dates, '2026-06-21')).toEqual({ current: 1, longest: 4 })
  })

  test('ignores duplicates and unsorted input', () => {
    const dates = ['2026-06-21', '2026-06-19', '2026-06-21', '2026-06-20', '2026-06-20']
    expect(computeStreak(dates, '2026-06-21')).toEqual({ current: 3, longest: 3 })
  })

  test('handles month and year boundaries correctly', () => {
    const dates = ['2025-12-30', '2025-12-31', '2026-01-01']
    expect(computeStreak(dates, '2026-01-01')).toEqual({ current: 3, longest: 3 })
  })
})

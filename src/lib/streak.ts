/**
 * Daily-streak arithmetic over a set of completed `YYYY-MM-DD` dates.
 *
 * `current` counts consecutive days ending at today, or at yesterday when today
 * is not yet done (the streak is still "alive" — you can extend it today). It
 * drops to 0 only once both today and yesterday are missing. `longest` is the
 * best consecutive run ever recorded.
 */

export interface Streak {
  current: number
  longest: number
}

/** Whole-day index for a `YYYY-MM-DD` string, or NaN if malformed (parsed as UTC
 *  to dodge DST/TZ drift). */
function dayIndex(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN
  const [y, m, d] = date.split('-').map(Number)
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000)
}

export function computeStreak(dates: string[], today: string): Streak {
  const days = [...new Set(dates.map(dayIndex))].filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
  if (days.length === 0) return { current: 0, longest: 0 }

  // Longest consecutive run.
  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i]! === days[i - 1]! + 1 ? run + 1 : 1
    if (run > longest) longest = run
  }

  // Current run: count back from today, or yesterday if today is not done yet.
  const set = new Set(days)
  const todayIdx = dayIndex(today)
  let cursor = set.has(todayIdx) ? todayIdx : set.has(todayIdx - 1) ? todayIdx - 1 : null
  let current = 0
  while (cursor !== null && set.has(cursor)) {
    current++
    cursor--
  }

  return { current, longest }
}

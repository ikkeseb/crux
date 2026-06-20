/**
 * Daily-seed helpers. The "puzzle of the day" is just a seed derived from the
 * calendar date (in local time) plus the puzzle type, so everyone playing on the
 * same day gets the same board.
 */

/** Format a Date as `YYYY-MM-DD` in local time. */
export function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Deterministic seed string for a given puzzle type on a given day. */
export function dailySeed(puzzle: string, date: Date = new Date()): string {
  return `crux:${puzzle}:${dateKey(date)}`
}

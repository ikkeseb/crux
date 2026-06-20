/**
 * Deterministic, seedable pseudo-random number generator.
 *
 * The whole game is built on this: every generated puzzle is a pure function of
 * its seed, so a given seed always yields the same board on any machine. That is
 * what makes daily-seed mode and reproducible tests possible.
 *
 * Algorithm: mulberry32 (a fast 32-bit generator with good statistical quality
 * for game/puzzle use), seeded via the xmur3 string hash.
 */

/** Hash an arbitrary string into a well-distributed 32-bit unsigned seed (xmur3). */
export function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

export class Rng {
  private state: number

  constructor(seed: number | string) {
    const s = typeof seed === 'number' ? Math.floor(seed) >>> 0 : hashSeed(seed)
    // Avoid the degenerate all-zero state.
    this.state = s === 0 ? 0x9e3779b9 : s
  }

  /** Snapshot of the internal state; pair with `setState` to fork/restore a stream. */
  getState(): number {
    return this.state
  }

  setState(state: number): void {
    this.state = state >>> 0
  }

  /** A fresh Rng that continues from this one's current state (independent thereafter). */
  fork(): Rng {
    const r = new Rng(1)
    r.setState(this.state)
    return r
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0
    return Math.floor(this.next() * maxExclusive)
  }

  /** Integer in [min, maxInclusive]. */
  range(min: number, maxInclusive: number): number {
    if (maxInclusive < min) return min
    return min + this.int(maxInclusive - min + 1)
  }

  /** True with probability `p`. */
  bool(p = 0.5): boolean {
    return this.next() < p
  }

  /** A random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array')
    return arr[this.int(arr.length)] as T
  }

  /** In-place Fisher–Yates shuffle. Returns the same array for convenience. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      const tmp = arr[i] as T
      arr[i] = arr[j] as T
      arr[j] = tmp
    }
    return arr
  }
}

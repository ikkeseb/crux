/**
 * Client-side persistence for crux: in-progress boards, best times, and the set
 * of completed daily dates (for streaks). Everything is namespaced under `crux:v1:`
 * and every read/write is defensive — corrupt JSON, missing or quota-limited
 * storage all degrade to "no data" rather than crashing the game.
 */
import type { Difficulty, PuzzleKind } from './types'

/** The slice of the Web Storage API we depend on (so tests can inject a fake). */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface CompletionInput {
  kind: PuzzleKind
  difficulty: Difficulty
  timeMs: number
  /** Whether this was the daily puzzle (its date then counts toward the streak). */
  daily?: boolean
  /** `YYYY-MM-DD` of the daily completion; required when `daily` is true. */
  date?: string
}

export interface CompletionResult {
  /** True when this run set a new best time for the kind+difficulty. */
  best: boolean
  /** The best time on record after this completion. */
  bestMs: number
}

interface Records {
  /** Best time in ms, keyed by `<kind>:<difficulty>`. */
  best: Record<string, number>
  /** Completed daily dates (`YYYY-MM-DD`), deduplicated, any kind. */
  dailies: string[]
}

/** What the player was last looking at, so a reload resumes it. */
export interface Session {
  kind: PuzzleKind
  seed: string
  difficulty: Difficulty
  daily: boolean
}

const NS = 'crux:v1'
const RECORDS_KEY = `${NS}:records`
const SESSION_KEY = `${NS}:session`

function boardKey(kind: PuzzleKind, seed: string, difficulty: Difficulty): string {
  return `${NS}:board:${kind}:${difficulty}:${seed}`
}

export class CruxStore {
  constructor(private readonly backend: KeyValueStore) {}

  private read<T>(key: string): T | null {
    try {
      const raw = this.backend.getItem(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.backend.setItem(key, JSON.stringify(value))
    } catch {
      // Storage full, disabled, or unavailable — persistence is best-effort.
    }
  }

  // ---- in-progress boards ----
  saveBoard(kind: PuzzleKind, seed: string, difficulty: Difficulty, data: unknown): void {
    this.write(boardKey(kind, seed, difficulty), data)
  }

  loadBoard(kind: PuzzleKind, seed: string, difficulty: Difficulty): unknown {
    return this.read(boardKey(kind, seed, difficulty))
  }

  clearBoard(kind: PuzzleKind, seed: string, difficulty: Difficulty): void {
    try {
      this.backend.removeItem(boardKey(kind, seed, difficulty))
    } catch {
      // ignore
    }
  }

  // ---- completions ----
  private records(): Records {
    const r = this.read<Partial<Records>>(RECORDS_KEY)
    return {
      best: r && typeof r.best === 'object' && r.best !== null ? r.best : {},
      dailies: Array.isArray(r?.dailies) ? r!.dailies! : [],
    }
  }

  recordCompletion(input: CompletionInput): CompletionResult {
    const rec = this.records()
    const key = `${input.kind}:${input.difficulty}`
    const prev = rec.best[key]
    const best = prev === undefined || input.timeMs < prev
    if (best) rec.best[key] = input.timeMs

    if (input.daily && input.date && !rec.dailies.includes(input.date)) {
      rec.dailies.push(input.date)
    }

    this.write(RECORDS_KEY, rec)
    return { best, bestMs: rec.best[key]! }
  }

  bestTime(kind: PuzzleKind, difficulty: Difficulty): number | null {
    const v = this.records().best[`${kind}:${difficulty}`]
    return v === undefined ? null : v
  }

  dailyDates(): string[] {
    return this.records().dailies
  }

  // ---- session pointer ----
  saveSession(session: Session): void {
    this.write(SESSION_KEY, session)
  }

  loadSession(): Session | null {
    const s = this.read<Partial<Session>>(SESSION_KEY)
    if (
      !s ||
      typeof s.kind !== 'string' ||
      typeof s.seed !== 'string' ||
      typeof s.difficulty !== 'string' ||
      typeof s.daily !== 'boolean'
    ) {
      return null
    }
    return { kind: s.kind, seed: s.seed, difficulty: s.difficulty, daily: s.daily }
  }
}

/** A KeyValueStore over `window.localStorage`, or an in-memory fallback when it
 *  is unavailable (private mode, SSR, disabled storage). */
function defaultBackend(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = `${NS}:__probe`
      localStorage.setItem(probe, '1')
      localStorage.removeItem(probe)
      return localStorage
    }
  } catch {
    // fall through to memory
  }
  const mem = new Map<string, string>()
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  }
}

/** Shared store instance for the app, created on first use. Lazy so importing
 *  this module never touches `localStorage` (keeps Node test runs side-effect free). */
let shared: CruxStore | null = null
export function getStore(): CruxStore {
  return (shared ??= new CruxStore(defaultBackend()))
}

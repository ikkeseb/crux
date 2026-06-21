import { beforeEach, describe, expect, test } from 'vitest'
import { CruxStore, type KeyValueStore } from './storage'

/** In-memory KeyValueStore; can be told to throw on writes (quota simulation). */
class MemStore implements KeyValueStore {
  map = new Map<string, string>()
  throwOnSet = false
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string): void {
    if (this.throwOnSet) throw new Error('QuotaExceeded')
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
}

describe('CruxStore — board persistence', () => {
  let backend: MemStore
  let store: CruxStore
  beforeEach(() => {
    backend = new MemStore()
    store = new CruxStore(backend)
  })

  test('loadBoard returns null when nothing is saved', () => {
    expect(store.loadBoard('sudoku', 'abc', 'easy')).toBeNull()
  })

  test('saveBoard then loadBoard round-trips the data', () => {
    const data = { values: [[1, 2]], pencil: [[0, 0]] }
    store.saveBoard('sudoku', 'abc', 'easy', data)
    expect(store.loadBoard('sudoku', 'abc', 'easy')).toEqual(data)
  })

  test('board is keyed by kind, seed and difficulty independently', () => {
    store.saveBoard('sudoku', 'abc', 'easy', { v: 1 })
    expect(store.loadBoard('sudoku', 'abc', 'hard')).toBeNull()
    expect(store.loadBoard('sudoku', 'xyz', 'easy')).toBeNull()
    expect(store.loadBoard('nonogram', 'abc', 'easy')).toBeNull()
  })

  test('clearBoard removes a saved board', () => {
    store.saveBoard('sudoku', 'abc', 'easy', { v: 1 })
    store.clearBoard('sudoku', 'abc', 'easy')
    expect(store.loadBoard('sudoku', 'abc', 'easy')).toBeNull()
  })

  test('corrupt stored value yields null instead of throwing', () => {
    backend.map.set('crux:v1:board:sudoku:easy:abc', '{not valid json')
    expect(store.loadBoard('sudoku', 'abc', 'easy')).toBeNull()
  })

  test('saveBoard swallows backend write failures', () => {
    backend.throwOnSet = true
    expect(() => store.saveBoard('sudoku', 'abc', 'easy', { v: 1 })).not.toThrow()
  })
})

describe('CruxStore — completions and best times', () => {
  let store: CruxStore
  beforeEach(() => {
    store = new CruxStore(new MemStore())
  })

  test('bestTime is null before any completion', () => {
    expect(store.bestTime('sokoban', 'medium')).toBeNull()
  })

  test('first completion is a new best', () => {
    const r = store.recordCompletion({ kind: 'sokoban', difficulty: 'medium', timeMs: 5000 })
    expect(r.best).toBe(true)
    expect(r.bestMs).toBe(5000)
    expect(store.bestTime('sokoban', 'medium')).toBe(5000)
  })

  test('a faster completion beats the previous best', () => {
    store.recordCompletion({ kind: 'sokoban', difficulty: 'medium', timeMs: 5000 })
    const r = store.recordCompletion({ kind: 'sokoban', difficulty: 'medium', timeMs: 3000 })
    expect(r.best).toBe(true)
    expect(r.bestMs).toBe(3000)
    expect(store.bestTime('sokoban', 'medium')).toBe(3000)
  })

  test('a slower completion does not change the best', () => {
    store.recordCompletion({ kind: 'sokoban', difficulty: 'medium', timeMs: 3000 })
    const r = store.recordCompletion({ kind: 'sokoban', difficulty: 'medium', timeMs: 9000 })
    expect(r.best).toBe(false)
    expect(r.bestMs).toBe(3000)
    expect(store.bestTime('sokoban', 'medium')).toBe(3000)
  })

  test('best times are independent per kind and difficulty', () => {
    store.recordCompletion({ kind: 'sokoban', difficulty: 'medium', timeMs: 3000 })
    expect(store.bestTime('sokoban', 'hard')).toBeNull()
    expect(store.bestTime('sudoku', 'medium')).toBeNull()
  })
})

describe('CruxStore — daily dates for streaks', () => {
  let store: CruxStore
  beforeEach(() => {
    store = new CruxStore(new MemStore())
  })

  test('a daily completion records its date', () => {
    store.recordCompletion({
      kind: 'sudoku',
      difficulty: 'easy',
      timeMs: 1000,
      daily: true,
      date: '2026-06-21',
    })
    expect(store.dailyDates()).toEqual(['2026-06-21'])
  })

  test('non-daily completions do not record a date', () => {
    store.recordCompletion({ kind: 'sudoku', difficulty: 'easy', timeMs: 1000 })
    expect(store.dailyDates()).toEqual([])
  })

  test('daily dates are deduplicated across kinds and repeats', () => {
    store.recordCompletion({ kind: 'sudoku', difficulty: 'easy', timeMs: 1, daily: true, date: '2026-06-21' })
    store.recordCompletion({ kind: 'sokoban', difficulty: 'easy', timeMs: 1, daily: true, date: '2026-06-21' })
    store.recordCompletion({ kind: 'nonogram', difficulty: 'easy', timeMs: 1, daily: true, date: '2026-06-20' })
    expect(store.dailyDates().sort()).toEqual(['2026-06-20', '2026-06-21'])
  })

  test('completion survives a corrupt records blob', () => {
    const backend = new MemStore()
    backend.map.set('crux:v1:records', 'garbage{')
    const s = new CruxStore(backend)
    const r = s.recordCompletion({ kind: 'sudoku', difficulty: 'easy', timeMs: 2000 })
    expect(r.best).toBe(true)
    expect(s.bestTime('sudoku', 'easy')).toBe(2000)
  })
})

describe('CruxStore — session pointer', () => {
  let store: CruxStore
  beforeEach(() => {
    store = new CruxStore(new MemStore())
  })

  test('loadSession is null before anything is saved', () => {
    expect(store.loadSession()).toBeNull()
  })

  test('saveSession then loadSession round-trips the pointer', () => {
    const session = { kind: 'sudoku' as const, seed: 'abc', difficulty: 'hard' as const, daily: false }
    store.saveSession(session)
    expect(store.loadSession()).toEqual(session)
  })

  test('saveSession overwrites the previous pointer', () => {
    store.saveSession({ kind: 'sudoku', seed: 'abc', difficulty: 'easy', daily: false })
    store.saveSession({ kind: 'sokoban', seed: 'xyz', difficulty: 'expert', daily: true })
    expect(store.loadSession()).toEqual({ kind: 'sokoban', seed: 'xyz', difficulty: 'expert', daily: true })
  })

  test('a corrupt session blob loads as null', () => {
    const backend = new MemStore()
    backend.map.set('crux:v1:session', 'nope{')
    expect(new CruxStore(backend).loadSession()).toBeNull()
  })

  test('a session missing required fields loads as null', () => {
    const backend = new MemStore()
    backend.map.set('crux:v1:session', JSON.stringify({ kind: 'sudoku' }))
    expect(new CruxStore(backend).loadSession()).toBeNull()
  })
})

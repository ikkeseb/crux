import { describe, it, expect } from 'vitest'
import { DIFFICULTIES } from '../lib/types'
import { applyMove, charToDir, isSolved, type DynState } from './level'
import { generateSokoban } from './generator'
import { solveSokoban } from './solver'
import type { SokobanLevel } from './types'

function replay(level: SokobanLevel, moves: string): DynState | null {
  let state: DynState = { boxes: level.boxes.slice(), player: level.player }
  for (const ch of moves) {
    const dir = charToDir(ch)
    if (dir < 0) return null
    const next = applyMove(level, state, dir)
    if (next === null) return null
    state = { boxes: next.boxes, player: next.player }
  }
  return state
}

describe('generateSokoban', () => {
  it('is deterministic for a given seed', () => {
    const a = generateSokoban('sok-seed-1', { difficulty: 'easy' })
    const b = generateSokoban('sok-seed-1', { difficulty: 'easy' })
    expect(b).toEqual(a)
  })

  it('produces different boards for different seeds', () => {
    const a = generateSokoban('sk-A', { difficulty: 'medium' })
    const b = generateSokoban('sk-B', { difficulty: 'medium' })
    expect(a.level.boxes).not.toEqual(b.level.boxes)
  })

  it('every generated puzzle is solvable, non-trivial, and its hint solves it', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let s = 0; s < 3; s++) {
        const p = generateSokoban(`sok-${difficulty}-${s}`, { difficulty })
        const level = p.level

        // not already solved
        expect(isSolved(level, level.boxes)).toBe(false)
        // player is not standing on a box, and boxes are on floor
        expect(level.boxes).not.toContain(level.player)
        for (const b of level.boxes) expect(level.walls[b]).toBe(false)
        // #goals >= #boxes
        const goalCount = level.goals.filter(Boolean).length
        expect(goalCount).toBeGreaterThanOrEqual(level.boxes.length)

        // independent solve confirms solvability
        const sol = solveSokoban(level)
        expect(sol.solved).toBe(true)

        // the embedded hint solution actually solves the level
        const final = replay(level, p.solution.moves)
        expect(final).not.toBeNull()
        expect(isSolved(level, (final as DynState).boxes)).toBe(true)

        expect(DIFFICULTIES).toContain(p.difficulty)
      }
    }
  })

  it('grades larger presets harder on average (difficulty sanity)', () => {
    const avg = (difficulty: 'easy' | 'expert'): number => {
      let sum = 0
      const n = 4
      for (let s = 0; s < n; s++) {
        sum += generateSokoban(`sok-avg-${difficulty}-${s}`, { difficulty }).score
      }
      return sum / n
    }
    expect(avg('expert')).toBeGreaterThan(avg('easy'))
  })

  it('honours the requested difficulty for most seeds', () => {
    for (const difficulty of DIFFICULTIES) {
      let matches = 0
      const n = 6
      for (let s = 0; s < n; s++) {
        const p = generateSokoban(`sok-honour-${difficulty}-${s}`, { difficulty })
        if (p.difficulty === difficulty) matches++
      }
      expect(matches).toBeGreaterThanOrEqual(5) // expert occasionally lands in hard
    }
  })
})

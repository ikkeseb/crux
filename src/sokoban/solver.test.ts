import { describe, it, expect } from 'vitest'
import { applyMove, charToDir, computePushDist, isSolved, parseLevel, type DynState } from './level'
import { solveSokoban } from './solver'
import type { SokobanLevel } from './types'

/** Replay a LURD move string and return the final dynamic state, or null if any move is illegal. */
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

describe('solveSokoban', () => {
  it('solves a one-push level', () => {
    const level = parseLevel(['#####', '#@$.#', '#####'].join('\n'))
    const sol = solveSokoban(level)
    expect(sol.solved).toBe(true)
    expect(sol.pushes.length).toBe(1)
    expect(sol.moves).toBe('R')
  })

  it('returns an already-solved level with no pushes', () => {
    const level = parseLevel(['#####', '#@*.#', '#####'].join('\n'))
    // box already on a goal, but there is a second empty goal → not solved
    const sol = solveSokoban(level)
    // one box, one goal occupied (the *), the '.' is an extra goal with no box →
    // solved requires every BOX on a goal, which is already true.
    expect(sol.solved).toBe(true)
    expect(sol.pushes.length).toBe(0)
  })

  it('solves a two-box level and the move string actually solves it', () => {
    const level = parseLevel(['#######', '#  @  #', '# $.$.#', '#######'].join('\n'))
    const sol = solveSokoban(level)
    expect(sol.solved).toBe(true)
    expect(sol.pushes.length).toBe(2)
    const final = replay(level, sol.moves)
    expect(final).not.toBeNull()
    expect(isSolved(level, (final as DynState).boxes)).toBe(true)
  })

  it('reports an unsolvable level as proven unsolvable', () => {
    // Box jammed in the top-left corner (walls above and left) can never move.
    const level = parseLevel(['#####', '#$@ #', '#   #', '#  .#', '#####'].join('\n'))
    const sol = solveSokoban(level)
    expect(sol.solved).toBe(false)
    expect(sol.status).toBe('unsolvable')
  })

  it('distinguishes a hit expansion cap from a proof of unsolvability', () => {
    const level = parseLevel(['#######', '#  @  #', '# $.$.#', '#######'].join('\n'))
    const capped = solveSokoban(level, { maxExpansions: 0 })
    expect(capped.solved).toBe(false)
    expect(capped.status).toBe('capped') // inconclusive, NOT 'unsolvable'
    expect(solveSokoban(level).status).toBe('solved') // solvable with a real budget
  })

  it('finds the push-optimal solution', () => {
    // Box must travel three cells to the goal → exactly 3 pushes.
    const level = parseLevel(['######', '#@$ .#', '######'].join('\n'))
    const sol = solveSokoban(level)
    expect(sol.solved).toBe(true)
    expect(sol.pushes.length).toBe(2)
  })
})

describe('computePushDist (deadlock map)', () => {
  it('marks unreachable corners as dead (Infinity) and goals as 0', () => {
    const level = parseLevel(['#####', '#  .#', '#   #', '#####'].join('\n'))
    const dist = computePushDist(level)
    const goalIdx = 1 * level.width + 3
    expect(dist[goalIdx]).toBe(0)
    // Top-left interior corner (1,1): a box there can't be pushed anywhere useful.
    const corner = 1 * level.width + 1
    expect(dist[corner]).toBe(Infinity)
  })
})

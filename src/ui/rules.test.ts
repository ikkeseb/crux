import { describe, expect, test } from 'vitest'
import { PUZZLE_KINDS } from '../lib/types'
import { rulesFor } from './rules'

describe('rulesFor', () => {
  test.each(PUZZLE_KINDS)('%s has complete how-to-play content', (kind) => {
    const r = rulesFor(kind)
    expect(r.title).toBeTruthy()
    expect(r.objective.length).toBeGreaterThan(20)
    expect(r.how.length).toBeGreaterThanOrEqual(2)
    expect(r.controls.length).toBeGreaterThanOrEqual(2)
    expect(r.touch.length).toBeGreaterThan(10)
  })
})

import { describe, it, expect } from 'vitest'
import { Rng, hashSeed } from './rng'

describe('Rng', () => {
  it('is deterministic for a numeric seed', () => {
    const a = new Rng(12345)
    const b = new Rng(12345)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('is deterministic for a string seed', () => {
    const a = new Rng('crux-2026-06-20')
    const b = new Rng('crux-2026-06-20')
    expect(Array.from({ length: 10 }, () => a.int(1000))).toEqual(
      Array.from({ length: 10 }, () => b.int(1000)),
    )
  })

  it('produces different streams for different seeds', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    expect(a.next()).not.toEqual(b.next())
  })

  it('next() stays within [0, 1)', () => {
    const r = new Rng('range-check')
    for (let i = 0; i < 5000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int() stays within [0, max)', () => {
    const r = new Rng(99)
    for (let i = 0; i < 5000; i++) {
      const v = r.int(10)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(10)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('range() is inclusive on both ends and reaches them', () => {
    const r = new Rng('range-bounds')
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) {
      const v = r.range(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
      seen.add(v)
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6, 7]))
  })

  it('shuffle is a permutation and deterministic', () => {
    const base = Array.from({ length: 50 }, (_, i) => i)
    const a = new Rng(7).shuffle([...base])
    const b = new Rng(7).shuffle([...base])
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual(base)
  })

  it('fork continues the same stream then diverges independently', () => {
    const r = new Rng(42)
    r.next()
    r.next()
    const forked = r.fork()
    // Immediately after forking, both streams agree.
    const main = Array.from({ length: 5 }, () => r.next())
    const side = Array.from({ length: 5 }, () => forked.next())
    expect(main).toEqual(side)
  })

  it('hashSeed is stable and unsigned 32-bit', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'))
    const h = hashSeed('anything')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
    expect(Number.isInteger(h)).toBe(true)
  })
})

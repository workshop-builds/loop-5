import { describe, expect, it } from 'vitest'
import { createPattern, toggleCell, ROWS, STEPS } from './pattern'

describe('pattern model', () => {
  it('has the 8 named rows', () => {
    expect(ROWS).toEqual(['Kick', 'Snare', 'Closed hat', 'Open hat', 'Clap', 'Tom', 'Rim', 'Shaker'])
  })
  it('creates an empty 8x16 pattern', () => {
    const p = createPattern()
    expect(p).toHaveLength(8)
    p.forEach((r) => {
      expect(r).toHaveLength(STEPS)
      expect(r.every((c) => c === false)).toBe(true)
    })
  })
  it('toggles a cell without mutating the original', () => {
    const p = createPattern()
    const q = toggleCell(p, 2, 5)
    expect(q[2][5]).toBe(true)
    expect(p[2][5]).toBe(false)
    expect(q.flat().filter(Boolean)).toHaveLength(1)
    expect(toggleCell(q, 2, 5)[2][5]).toBe(false)
  })
  it('ignores out-of-range cells', () => {
    const p = createPattern()
    expect(toggleCell(p, 8, 0)).toBe(p)
    expect(toggleCell(p, 0, 16)).toBe(p)
    expect(toggleCell(p, -1, 0)).toBe(p)
  })
})

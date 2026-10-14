import { describe, expect, it } from 'vitest'
import { ROWS, STEPS } from './pattern'
import { decodeState, encodeState } from './share'
import { STARTERS, starterState } from './starters'
import { MAX_BPM, MAX_SWING, MIN_BPM } from './timing'

describe('starter patterns', () => {
  it('has the six named starters', () => {
    expect(STARTERS.map((s) => s.id)).toEqual(['house', 'hip-hop', 'techno', 'breakbeat', 'reggaeton', 'half-time'])
  })

  for (const starter of STARTERS) {
    describe(starter.name, () => {
      const state = starterState(starter)

      it('is a valid 8x16 pattern', () => {
        expect(starter.rows).toHaveLength(ROWS.length)
        for (const row of starter.rows) expect(row).toMatch(/^[x.]{16}$/)
        expect(state.pattern).toHaveLength(ROWS.length)
        for (const row of state.pattern) expect(row).toHaveLength(STEPS)
      })

      it('has a tempo and swing in range, and at least one hit', () => {
        expect(Number.isInteger(state.bpm)).toBe(true)
        expect(state.bpm).toBeGreaterThanOrEqual(MIN_BPM)
        expect(state.bpm).toBeLessThanOrEqual(MAX_BPM)
        expect(state.swing).toBeGreaterThanOrEqual(0)
        expect(state.swing).toBeLessThanOrEqual(MAX_SWING)
        expect(state.pattern.flat().some(Boolean)).toBe(true)
      })

      it('survives the share link round-trip', () => {
        expect(decodeState(encodeState(state))).toEqual(state)
      })
    })
  }

  it('are all different', () => {
    const keys = STARTERS.map((s) => JSON.stringify(starterState(s).pattern))
    expect(new Set(keys).size).toBe(STARTERS.length)
  })
})

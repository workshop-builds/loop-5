import { describe, expect, it } from 'vitest'
import { decodeState, defaultState, encodeState, shareUrl, type ShareState } from './share'
import { ROWS, STEPS, toggleCell } from './pattern'

function sample(): ShareState {
  let pattern = defaultState().pattern
  for (const [r, s] of [[0, 0], [0, 15], [1, 4], [2, 7], [7, 9], [5, 3]]) pattern = toggleCell(pattern, r, s)
  return { pattern, bpm: 97, swing: 0.5, volumes: [0, 100, 55, 80, 1, 99, 20, 80] }
}

describe('share encoding', () => {
  it('round-trips a state', () => {
    const state = sample()
    expect(decodeState('#' + encodeState(state))).toEqual(state)
  })

  it('round-trips the defaults, and an empty hash gives the defaults', () => {
    const d = defaultState()
    expect(decodeState(encodeState(d))).toEqual(d)
    expect(decodeState('')).toEqual(d)
    expect(decodeState('#')).toEqual(d)
  })

  it('round-trips every single cell and the extreme settings', () => {
    for (let r = 0; r < ROWS.length; r++) {
      for (let s = 0; s < STEPS; s++) {
        const state = { ...sample(), pattern: toggleCell(defaultState().pattern, r, s), bpm: 60, swing: 0.75 }
        expect(decodeState(encodeState(state))).toEqual(state)
      }
    }
    const all = { ...defaultState(), bpm: 180 }
    all.pattern = all.pattern.map((row) => row.map(() => true))
    expect(decodeState(encodeState(all))).toEqual(all)
  })

  it('builds a link that replaces the old hash', () => {
    const url = shareUrl(sample(), 'https://example.test/app/?x=1#old')
    expect(url.startsWith('https://example.test/app/?x=1#p=')).toBe(true)
    expect(decodeState(new URL(url).hash)).toEqual(sample())
  })

  const good = encodeState(sample())
  const bad: Record<string, string> = {
    garbage: 'hello world',
    'random bytes': '%E0%A4%A&&==&p',
    truncated: good.slice(0, 20),
    'truncated steps': good.replace(/p=[0-9a-f]{32}/, 'p=0123'),
    'non-hex steps': good.replace(/p=[0-9a-f]{32}/, 'p=' + 'z'.repeat(32)),
    'long steps': good.replace(/p=([0-9a-f]{32})/, 'p=$1ff'),
    'tempo too high': good.replace('t=97', 't=999'),
    'tempo too low': good.replace('t=97', 't=10'),
    'tempo not a number': good.replace('t=97', 't=fast'),
    'tempo negative': good.replace('t=97', 't=-5'),
    'tempo decimal': good.replace('t=97', 't=97.5'),
    'swing too high': good.replace('s=50', 's=90'),
    'volume too high': good.replace('v=0.', 'v=101.'),
    'volume missing': good.replace(/v=.*/, 'v=80.80'),
    'volume not a number': good.replace('v=0.', 'v=x.'),
    'tempo missing': good.replace('&t=97', ''),
    'huge number': good.replace('t=97', 't=' + '9'.repeat(400)),
  }
  for (const [name, hash] of Object.entries(bad)) {
    it(`falls back to defaults: ${name}`, () => {
      expect(() => decodeState(hash)).not.toThrow()
      expect(decodeState(hash)).toEqual(defaultState())
    })
  }
})

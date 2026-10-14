import { describe, expect, it } from 'vitest'
import { MAX_BPM, MAX_SWING, MIN_BPM, clampBpm, clampSwing, stepDuration, swingOffset } from './timing'
import { DEFAULT_VOLUME, clampVolume, volumeToGain } from './mix'

describe('clampBpm', () => {
  it('keeps values from 60 to 180', () => {
    expect(clampBpm(60)).toBe(60)
    expect(clampBpm(120)).toBe(120)
    expect(clampBpm(180)).toBe(180)
  })
  it('clamps values outside the range', () => {
    expect(clampBpm(10)).toBe(MIN_BPM)
    expect(clampBpm(-5)).toBe(MIN_BPM)
    expect(clampBpm(999)).toBe(MAX_BPM)
    expect(clampBpm(Infinity)).toBe(MAX_BPM)
  })
  it('rounds to whole BPM and survives NaN', () => {
    expect(clampBpm(120.4)).toBe(120)
    expect(clampBpm(NaN)).toBe(120)
  })
})

describe('clampSwing', () => {
  it('clamps between 0 and the maximum', () => {
    expect(clampSwing(-1)).toBe(0)
    expect(clampSwing(0.3)).toBe(0.3)
    expect(clampSwing(2)).toBe(MAX_SWING)
    expect(clampSwing(NaN)).toBe(0)
  })
})

describe('swingOffset', () => {
  it('is zero at 0% swing for every step (straight timing)', () => {
    for (let s = 0; s < 16; s++) expect(swingOffset(s, 120, 0)).toBe(0)
  })
  it('never moves on-beat (even) steps', () => {
    for (let s = 0; s < 16; s += 2) expect(swingOffset(s, 120, MAX_SWING)).toBe(0)
  })
  it('delays off-beat (odd) steps in proportion to swing', () => {
    const step = stepDuration(120)
    expect(swingOffset(1, 120, 0.5)).toBeCloseTo(step / 3)
    expect(swingOffset(3, 120, MAX_SWING)).toBeCloseTo(step / 2)
    expect(swingOffset(15, 120, 0.25)).toBeCloseTo(step / 6)
  })
  it('scales with tempo and clamps out-of-range swing', () => {
    expect(swingOffset(1, 60, 0.5)).toBeCloseTo(stepDuration(60) / 3)
    expect(swingOffset(1, 120, 5)).toBeCloseTo(swingOffset(1, 120, MAX_SWING))
  })
})

describe('row volume', () => {
  it('clamps to 0..100', () => {
    expect(clampVolume(-10)).toBe(0)
    expect(clampVolume(150)).toBe(100)
    expect(clampVolume(55.4)).toBe(55)
    expect(clampVolume(NaN)).toBe(DEFAULT_VOLUME)
  })
  it('maps 0 to silence and louder volumes to larger gain', () => {
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(100)).toBe(1)
    expect(volumeToGain(30)).toBeLessThan(volumeToGain(60))
    expect(volumeToGain(-4)).toBe(0)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Scheduler } from './scheduler'
import { stepDuration } from './timing'

describe('stepDuration', () => {
  it('is a 16th note', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125)
    expect(stepDuration(60)).toBeCloseTo(0.25)
    expect(stepDuration(180)).toBeCloseTo(1 / 12)
  })
})

describe('Scheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('schedules steps in order at 120 BPM and wraps after 16', () => {
    let clock = 10
    const seen: [number, number][] = []
    const s = new Scheduler({ now: () => clock, bpm: 120, onStep: (st, t) => seen.push([st, t]) })
    s.start()
    for (let i = 0; i < 60; i++) {
      clock += 0.05
      s.tick()
    }
    s.stop()
    expect(seen[0][0]).toBe(0)
    expect(seen[0][1]).toBeCloseTo(10.05)
    expect(seen.map((x) => x[0]).slice(0, 18)).toEqual([...Array(16).keys(), 0, 1])
    for (let i = 1; i < seen.length; i++) expect(seen[i][1] - seen[i - 1][1]).toBeCloseTo(0.125)
  })

  it('only schedules inside the look-ahead window and stops cleanly', () => {
    const seen: number[] = []
    const s = new Scheduler({ now: () => 0, bpm: 120, onStep: (st) => seen.push(st), lookahead: 0.1 })
    s.start()
    expect(seen).toEqual([0]) // step 1 would start at 0.175, beyond the window
    expect(s.running).toBe(true)
    s.stop()
    expect(s.running).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual([0])
  })
})

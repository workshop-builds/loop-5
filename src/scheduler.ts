import { STEPS } from './pattern'
import { stepDuration } from './timing'

export interface SchedulerOptions {
  now: () => number
  bpm: number
  onStep: (step: number, time: number) => void
  lookahead?: number // seconds scheduled ahead of the clock
  startDelay?: number // seconds between start and the first step
}

// Look-ahead scheduler: each tick() schedules every step that falls inside the window.
export class Scheduler {
  private next = 0
  private nextTime = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly lookahead: number
  private readonly startDelay: number

  constructor(private readonly opts: SchedulerOptions) {
    this.lookahead = opts.lookahead ?? 0.1
    this.startDelay = opts.startDelay ?? 0.05
  }

  get running(): boolean {
    return this.timer !== null
  }

  start(intervalMs = 25) {
    if (this.timer !== null) return
    this.next = 0
    this.nextTime = this.opts.now() + this.startDelay
    this.timer = setInterval(() => this.tick(), intervalMs)
    this.tick()
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  tick() {
    const horizon = this.opts.now() + this.lookahead
    while (this.nextTime < horizon) {
      this.opts.onStep(this.next, this.nextTime)
      this.nextTime += stepDuration(this.opts.bpm)
      this.next = (this.next + 1) % STEPS
    }
  }
}

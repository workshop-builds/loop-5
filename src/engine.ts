import { clampBpm, clampSwing } from './timing'
import { volumeToGain } from './mix'
import { Scheduler } from './scheduler'
import { VOICES } from './voices'
import type { Pattern } from './pattern'

export interface Settings {
  bpm: number
  swing: number
  volumes: number[]
}

interface Played {
  step: number
  time: number
}

// Owns the AudioContext; created lazily on the first user gesture.
export class Engine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private rows: GainNode[] = []
  private scheduler: Scheduler | null = null
  private queue: Played[] = []
  private current = -1

  constructor(
    private readonly getPattern: () => Pattern,
    private readonly getSettings: () => Settings,
  ) {}

  // Must be called from a user gesture (tap/click).
  async unlock(): Promise<boolean> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return false
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.8
      this.master.connect(this.ctx.destination)
      const { master, ctx } = this
      this.rows = VOICES.map(() => {
        const g = ctx.createGain()
        g.connect(master)
        return g
      })
      const len = this.ctx.sampleRate
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state !== 'running') await this.ctx.resume()
    return this.ctx.state === 'running'
  }

  get playing(): boolean {
    return this.scheduler?.running ?? false
  }

  start() {
    const ctx = this.ctx
    if (!ctx || this.playing) return
    this.queue = []
    this.current = -1
    this.scheduler = new Scheduler({
      now: () => ctx.currentTime,
      // Tempo and swing are read on every tick, so changes apply without stopping.
      bpm: () => clampBpm(this.getSettings().bpm),
      swing: () => clampSwing(this.getSettings().swing),
      onStep: (step, time) => {
        this.queue.push({ step, time })
        // Read the pattern and volumes at schedule time so edits are heard on the next pass.
        const { volumes } = this.getSettings()
        this.getPattern().forEach((row, r) => {
          const gain = volumeToGain(volumes[r])
          if (!row[step] || gain === 0) return // a muted row makes no sound
          this.rows[r].gain.setValueAtTime(gain, time)
          VOICES[r](ctx, this.rows[r], time, this.noise!)
        })
      },
    })
    this.scheduler.start()
  }

  stop() {
    this.scheduler?.stop()
    this.queue = []
    this.current = -1
  }

  // Step being heard right now, or -1 when stopped.
  currentStep(): number {
    if (!this.ctx || !this.playing) return -1
    while (this.queue.length && this.queue[0].time <= this.ctx.currentTime) {
      this.current = this.queue.shift()!.step
    }
    return this.current
  }
}

// Eight drum voices built from oscillators and noise; no audio files.
export type Voice = (ctx: AudioContext, out: AudioNode, t: number, noise: AudioBuffer) => void

function env(ctx: AudioContext, out: AudioNode, t: number, peak: number, dur: number) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(peak, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  g.connect(out)
  return g
}

function osc(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  f0: number,
  f1: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'sine',
) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  o.connect(env(ctx, out, t, peak, dur))
  o.start(t)
  o.stop(t + dur + 0.02)
}

function hiss(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  noise: AudioBuffer,
  type: BiquadFilterType,
  freq: number,
  dur: number,
  peak: number,
  q = 1,
) {
  const s = ctx.createBufferSource()
  s.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  s.connect(f)
  f.connect(env(ctx, out, t, peak, dur))
  s.start(t)
  s.stop(t + dur + 0.02)
}

// Same order as ROWS in pattern.ts.
export const VOICES: Voice[] = [
  // kick
  (c, o, t) => osc(c, o, t, 150, 45, 0.35, 1),
  // snare
  (c, o, t, n) => {
    osc(c, o, t, 220, 120, 0.12, 0.5, 'triangle')
    hiss(c, o, t, n, 'highpass', 1500, 0.18, 0.7)
  },
  // closed hat
  (c, o, t, n) => hiss(c, o, t, n, 'highpass', 7000, 0.05, 0.4),
  // open hat
  (c, o, t, n) => hiss(c, o, t, n, 'highpass', 7000, 0.3, 0.4),
  // clap
  (c, o, t, n) => {
    for (const d of [0, 0.012, 0.024]) hiss(c, o, t + d, n, 'bandpass', 1200, 0.03, 0.6, 2)
    hiss(c, o, t + 0.036, n, 'bandpass', 1200, 0.15, 0.6, 2)
  },
  // tom
  (c, o, t) => osc(c, o, t, 200, 100, 0.3, 0.9),
  // rim
  (c, o, t) => {
    osc(c, o, t, 1700, 1200, 0.04, 0.4, 'square')
    osc(c, o, t, 500, 400, 0.04, 0.4, 'triangle')
  },
  // shaker
  (c, o, t, n) => hiss(c, o, t, n, 'bandpass', 5500, 0.09, 0.35),
]

export const DEFAULT_BPM = 120
export const MIN_BPM = 60
export const MAX_BPM = 180
export const DEFAULT_SWING = 0
export const MAX_SWING = 0.75

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

// Tempo is a whole number of BPM between MIN_BPM and MAX_BPM; anything else is clamped.
export function clampBpm(bpm: number): number {
  return Math.round(clamp(bpm, MIN_BPM, MAX_BPM, DEFAULT_BPM))
}

// Swing is a fraction from 0 (straight) to MAX_SWING.
export function clampSwing(swing: number): number {
  return clamp(swing, 0, MAX_SWING, DEFAULT_SWING)
}

// Length of one 16th-note step in seconds.
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4
}

// Seconds by which a step is delayed by swing. Only off-beat 16ths (odd steps) move.
// 50% swing delays by a third of a step (triplet feel); 75% delays by half a step.
export function swingOffset(step: number, bpm: number, swing: number): number {
  if (step % 2 === 0) return 0
  return clampSwing(swing) * (2 / 3) * stepDuration(bpm)
}

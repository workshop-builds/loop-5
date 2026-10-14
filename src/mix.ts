export const MIN_VOLUME = 0
export const MAX_VOLUME = 100
export const DEFAULT_VOLUME = 80

// Row volume is a whole number from 0 (mute) to 100; anything else is clamped.
export function clampVolume(volume: number): number {
  if (typeof volume !== 'number' || Number.isNaN(volume)) return DEFAULT_VOLUME
  return Math.round(Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, volume)))
}

// Gain for a volume: a squared curve so the slider feels even; 0 is silent.
export function volumeToGain(volume: number): number {
  const v = clampVolume(volume) / MAX_VOLUME
  return v * v
}

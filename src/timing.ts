export const DEFAULT_BPM = 120

// Length of one 16th-note step in seconds.
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4
}

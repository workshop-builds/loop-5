export const ROWS = ['Kick', 'Snare', 'Closed hat', 'Open hat', 'Clap', 'Tom', 'Rim', 'Shaker'] as const
export const STEPS = 16

export type Pattern = boolean[][]

export function createPattern(): Pattern {
  return ROWS.map(() => Array<boolean>(STEPS).fill(false))
}

// Returns a new pattern with one cell flipped; out-of-range cells leave it unchanged.
export function toggleCell(pattern: Pattern, row: number, step: number): Pattern {
  if (!Number.isInteger(row) || !Number.isInteger(step)) return pattern
  if (row < 0 || row >= ROWS.length || step < 0 || step >= STEPS) return pattern
  return pattern.map((r, i) => (i === row ? r.map((on, s) => (s === step ? !on : on)) : r))
}

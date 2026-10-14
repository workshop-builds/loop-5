import { DEFAULT_VOLUME } from './mix'
import { ROWS, STEPS, type Pattern } from './pattern'
import type { ShareState } from './share'

export interface Starter {
  id: string
  name: string
  bpm: number
  // Swing in whole percent.
  swing: number
  // One string per row, in ROWS order, 16 characters: "x" is a hit, "." is a rest.
  rows: readonly string[]
}

export const STARTERS: readonly Starter[] = [
  {
    id: 'house',
    name: 'House',
    bpm: 124,
    swing: 0,
    rows: [
      'x...x...x...x...', // kick: four on the floor
      '................',
      'x.x.x.x.x.x.x.x.',
      '..x...x...x...x.', // open hat on the off-beats
      '....x.......x...', // clap on 2 and 4
      '................',
      '................',
      '.x.x.x.x.x.x.x.x',
    ],
  },
  {
    id: 'hip-hop',
    name: 'Hip hop',
    bpm: 90,
    swing: 30,
    rows: [
      'x.....x...x.....',
      '....x.......x...',
      'x.x.x.x.x.x.x.x.',
      '..............x.',
      '................',
      '.............x..',
      '......x.........',
      '................',
    ],
  },
  {
    id: 'techno',
    name: 'Techno',
    bpm: 132,
    swing: 0,
    rows: [
      'x...x...x...x...',
      '................',
      'xxxxxxxxxxxxxxxx',
      '..x...x...x...x.',
      '....x.......x...',
      '................',
      '..x.......x.....',
      '................',
    ],
  },
  {
    id: 'breakbeat',
    name: 'Breakbeat',
    bpm: 135,
    swing: 10,
    rows: [
      'x.....x...x.....',
      '....x..x.x..x...',
      'x.x.x.x.x.x.x.x.',
      '.......x......x.',
      '................',
      '...........x....',
      '.....x..........',
      '................',
    ],
  },
  {
    id: 'reggaeton',
    name: 'Reggaeton',
    bpm: 96,
    swing: 0,
    rows: [
      'x..x..x.x..x..x.', // the dembow rhythm
      '...x..x....x..x.',
      'x.x.x.x.x.x.x.x.',
      '................',
      '................',
      '................',
      '................',
      'x.x.x.x.x.x.x.x.',
    ],
  },
  {
    id: 'half-time',
    name: 'Half-time',
    bpm: 140,
    swing: 0,
    rows: [
      'x.........x.....',
      '........x.......',
      'x.x.x.x.x.x.x.x.',
      '..............x.',
      '........x.......',
      '................',
      '................',
      '................',
    ],
  },
]

function parseRows(rows: readonly string[]): Pattern {
  return rows.map((r) => Array.from({ length: STEPS }, (_, i) => r[i] === 'x'))
}

// The full state a starter loads: its pattern, tempo and swing, with default row volumes.
export function starterState(starter: Starter): ShareState {
  return {
    pattern: parseRows(starter.rows),
    bpm: starter.bpm,
    swing: starter.swing / 100,
    volumes: ROWS.map(() => DEFAULT_VOLUME),
  }
}

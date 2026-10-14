import { DEFAULT_VOLUME, MAX_VOLUME, MIN_VOLUME } from './mix'
import { ROWS, STEPS, createPattern, type Pattern } from './pattern'
import { DEFAULT_BPM, DEFAULT_SWING, MAX_BPM, MAX_SWING, MIN_BPM } from './timing'

export interface ShareState {
  pattern: Pattern
  bpm: number
  swing: number
  volumes: number[]
}

export function defaultState(): ShareState {
  return {
    pattern: createPattern(),
    bpm: DEFAULT_BPM,
    swing: DEFAULT_SWING,
    volumes: ROWS.map(() => DEFAULT_VOLUME),
  }
}

const DIGITS_PER_ROW = STEPS / 4
const MAX_SWING_PERCENT = Math.round(MAX_SWING * 100)

// Steps: one hex digit per 4 steps (first step is the top bit), rows in order.
function encodeSteps(pattern: Pattern): string {
  return pattern
    .map((row) => {
      let out = ''
      for (let g = 0; g < DIGITS_PER_ROW; g++) {
        let n = 0
        for (let k = 0; k < 4; k++) n = n * 2 + (row[g * 4 + k] ? 1 : 0)
        out += n.toString(16)
      }
      return out
    })
    .join('')
}

function decodeSteps(text: string): Pattern | null {
  if (text.length !== ROWS.length * DIGITS_PER_ROW || !/^[0-9a-f]+$/.test(text)) return null
  return ROWS.map((_, r) => {
    const row: boolean[] = []
    for (let g = 0; g < DIGITS_PER_ROW; g++) {
      const n = parseInt(text[r * DIGITS_PER_ROW + g], 16)
      for (let k = 3; k >= 0; k--) row.push(((n >> k) & 1) === 1)
    }
    return row
  })
}

function parseInteger(text: string | null, min: number, max: number): number | null {
  if (text === null || !/^\d{1,3}$/.test(text)) return null
  const n = Number(text)
  return n >= min && n <= max ? n : null
}

// The hash looks like "#p=<32 hex>&t=120&s=0&v=80.80.80.80.80.80.80.80".
export function encodeState(state: ShareState): string {
  const params = new URLSearchParams()
  params.set('p', encodeSteps(state.pattern))
  params.set('t', String(Math.round(state.bpm)))
  params.set('s', String(Math.round(state.swing * 100)))
  params.set('v', state.volumes.map((v) => String(Math.round(v))).join('.'))
  return params.toString()
}

// Never throws. Anything missing, malformed, truncated or out of range gives the defaults.
export function decodeState(hash: string): ShareState {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const pattern = decodeSteps(params.get('p') ?? '')
    const bpm = parseInteger(params.get('t'), MIN_BPM, MAX_BPM)
    const swingPercent = parseInteger(params.get('s'), 0, MAX_SWING_PERCENT)
    const parts = (params.get('v') ?? '').split('.')
    const volumes = parts.map((p) => parseInteger(p, MIN_VOLUME, MAX_VOLUME))
    if (!pattern || bpm === null || swingPercent === null) return defaultState()
    if (parts.length !== ROWS.length || volumes.some((v) => v === null)) return defaultState()
    return { pattern, bpm, swing: swingPercent / 100, volumes: volumes as number[] }
  } catch {
    return defaultState()
  }
}

// The full link for a state, built on a page URL (any existing hash is replaced).
export function shareUrl(state: ShareState, pageUrl: string): string {
  return `${pageUrl.split('#')[0]}#${encodeState(state)}`
}

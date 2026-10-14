// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// sRGB values of the Tailwind palette colours App.tsx uses.
const C = {
  page: '#0a0a0a', // neutral-950
  n900: '#171717',
  n800: '#262626',
  n700: '#404040',
  n500: '#737373',
  n400: '#a3a3a3',
  n200: '#e5e5e5',
  n100: '#f5f5f5',
  white: '#ffffff',
  black: '#000000',
  lime400: '#9ae600', // on-state cells, Play button
  lime300: '#bbf451',
  lime200: '#d8f999',
  red300: '#ffa2a2',
}

describe('contrast (WCAG AA)', () => {
  it('text is at least 4.5:1', () => {
    const pairs: [string, string, string][] = [
      ['title and labels, white on page', C.white, C.page],
      ['hints, neutral-100 on page', C.n100, C.page],
      ['row labels, neutral-200 on page', C.n200, C.page],
      ['Play button, black on lime-400', C.black, C.lime400],
      ['Tap to start, black on white', C.black, C.white],
      ['inputs, white on neutral-900', C.white, C.n900],
      ['"Link copied", lime-300 on page', C.lime300, C.page],
      ['error, red-300 on page', C.red300, C.page],
    ]
    for (const [name, fg, bg] of pairs) expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(4.5)
  })

  it('active cells and cell edges are at least 3:1 against their surroundings', () => {
    expect(contrast(C.lime400, C.page)).toBeGreaterThanOrEqual(3)
    expect(contrast(C.lime400, C.n800)).toBeGreaterThanOrEqual(3)
    expect(contrast(C.lime400, C.n700)).toBeGreaterThanOrEqual(3)
    expect(contrast(C.lime200, C.page)).toBeGreaterThanOrEqual(3) // on-cell border
    expect(contrast(C.n500, C.page)).toBeGreaterThanOrEqual(3) // off-cell border, light groups
    expect(contrast(C.n400, C.page)).toBeGreaterThanOrEqual(3) // off-cell border, shaded groups
    expect(contrast(C.white, C.page)).toBeGreaterThanOrEqual(3) // playhead ring and focus ring
  })

  it('the App uses the palette classes checked above for cells', () => {
    const src = readFileSync(join(root, 'src', 'App.tsx'), 'utf8')
    for (const cls of ['border-lime-200 bg-lime-400', 'border-neutral-500 bg-neutral-800', 'border-neutral-400 bg-neutral-700', 'ring-white']) {
      expect(src).toContain(cls)
    }
  })
})

describe('touch and focus styles', () => {
  const css = readFileSync(join(root, 'src', 'index.css'), 'utf8')
  it('disables double-tap zoom on controls', () => expect(css).toMatch(/touch-action:\s*manipulation/))
  it('prevents text selection when tapping buttons', () => expect(css).toMatch(/user-select:\s*none/))
  it('has a visible focus style', () => expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid #ffffff/))
  it('the viewport allows device width and pinch zoom', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    expect(html).toContain('width=device-width')
    expect(html).not.toMatch(/user-scalable=no|maximum-scale/)
  })
})

// @vitest-environment node
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const outDir = join(root, 'node_modules', '.tmp', 'dist-check')

// Strings that look like URLs but are never requested by the browser:
// XML namespace identifiers and React's error-message documentation link.
const NOT_REQUESTS = [
  /^https?:\/\/www\.w3\.org\/(\d{4}\/[\w-]+|XML\/1998\/namespace|1998\/Math\/MathML)$/,
  /^https:\/\/react\.dev\/errors/,
  /^https:\/\/tailwindcss\.com$/, // name in the Tailwind license comment of the CSS
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe('built app', () => {
  beforeAll(async () => {
    rmSync(outDir, { recursive: true, force: true })
    // Vitest runs with NODE_ENV=test; build like `npm run build` does (production React).
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await build({ root, mode: 'production', logLevel: 'silent', build: { outDir, emptyOutDir: true } })
    } finally {
      process.env.NODE_ENV = previous
    }
  }, 60_000)
  afterAll(() => rmSync(outDir, { recursive: true, force: true }))

  it('makes no request to another origin', () => {
    const all = files(outDir)
    expect(all.length).toBeGreaterThan(0)
    const found: string[] = []
    for (const file of all) {
      const text = readFileSync(file, 'utf8')
      // Absolute and protocol-relative URLs.
      for (const m of text.matchAll(/(?:https?:)?\/\/[A-Za-z0-9][^\s"'`)<>\\]*/g)) {
        const url = m[0]
        // Skip "//" that is part of a comment or a regex/path, not a host: needs a dot or "localhost".
        if (!/^(?:https?:)?\/\/[^/]*(\.|localhost)/.test(url)) continue
        if (NOT_REQUESTS.some((re) => re.test(url))) continue
        found.push(`${file.slice(outDir.length)}: ${url}`)
      }
    }
    expect(found).toEqual([])
  })

  it('loads only its own files from index.html, with relative paths', () => {
    const html = readFileSync(join(outDir, 'index.html'), 'utf8')
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(ref).toMatch(/^\.\/assets\//)
  })

  // The React bundle itself mentions these APIs, so scan our own source instead of dist.
  it('our source has no fetch, XHR, WebSocket or sendBeacon calls', () => {
    const own = files(join(root, 'src')).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    expect(own.length).toBeGreaterThan(0)
    for (const file of own) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|new WebSocket|sendBeacon|EventSource/)
    }
  })
})

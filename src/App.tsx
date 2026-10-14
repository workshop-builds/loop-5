import { useState } from 'react'
import { ROWS, STEPS, createPattern, toggleCell } from './pattern'

export default function App() {
  const [pattern, setPattern] = useState(createPattern)

  return (
    <main className="mx-auto max-w-5xl px-3 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-white">Loop Lab</h1>
        <button
          type="button"
          onClick={() => setPattern(createPattern())}
          className="min-h-10 rounded-md border border-neutral-500 px-4 font-semibold text-white hover:bg-neutral-800"
        >
          Clear
        </button>
      </header>

      <div className="mt-5 overflow-x-auto pb-2" role="group" aria-label="Step grid">
        <div className="inline-flex min-w-max flex-col gap-1.5">
          {ROWS.map((name, r) => (
            <div key={name} className="flex items-center gap-2">
              <span className="sticky left-0 z-10 w-24 shrink-0 bg-neutral-950 pr-1 text-sm font-medium text-neutral-200">
                {name}
              </span>
              <div className="flex gap-3">
                {Array.from({ length: STEPS / 4 }, (_, g) => (
                  <div key={g} className="flex gap-1" data-beat={g + 1}>
                    {[0, 1, 2, 3].map((k) => {
                      const s = g * 4 + k
                      const on = pattern[r][s]
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${name} step ${s + 1}, ${on ? 'on' : 'off'}`}
                          onClick={() => setPattern((p) => toggleCell(p, r, s))}
                          className={`h-10 w-10 shrink-0 rounded-md border-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white ${
                            on
                              ? 'border-lime-200 bg-lime-400'
                              : g % 2 === 0
                                ? 'border-neutral-600 bg-neutral-800'
                                : 'border-neutral-600 bg-neutral-700'
                          }`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

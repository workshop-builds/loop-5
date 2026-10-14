import { useEffect, useRef, useState } from 'react'
import { Engine } from './engine'
import { ROWS, STEPS, createPattern, toggleCell } from './pattern'

export default function App() {
  const [pattern, setPattern] = useState(createPattern)
  const [unlocked, setUnlocked] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(-1)
  const [error, setError] = useState('')
  const patternRef = useRef(pattern)
  patternRef.current = pattern
  const engineRef = useRef<Engine | null>(null)
  if (!engineRef.current) engineRef.current = new Engine(() => patternRef.current)
  const engine = engineRef.current

  useEffect(() => {
    if (!playing) {
      setStep(-1)
      return
    }
    let raf = 0
    const loop = () => {
      setStep(engine.currentStep())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, engine])

  useEffect(() => () => engine.stop(), [engine])

  async function unlock() {
    const ok = await engine.unlock()
    setUnlocked(ok)
    setError(ok ? '' : 'Audio is not available in this browser.')
    return ok
  }

  async function togglePlay() {
    if (playing) {
      engine.stop()
      setPlaying(false)
      return
    }
    if (!(await unlock())) return
    engine.start()
    setPlaying(true)
  }

  return (
    <main className="mx-auto max-w-5xl px-3 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-white">Loop Lab</h1>
        <div className="flex gap-2">
          {!unlocked && (
            <button
              type="button"
              onClick={unlock}
              className="min-h-10 rounded-md bg-white px-4 font-semibold text-black hover:bg-neutral-200"
            >
              Tap to start
            </button>
          )}
          <button
            type="button"
            onClick={togglePlay}
            className="min-h-10 rounded-md bg-lime-400 px-4 font-semibold text-black hover:bg-lime-300"
          >
            {playing ? 'Stop' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => setPattern(createPattern())}
            className="min-h-10 rounded-md border border-neutral-500 px-4 font-semibold text-white hover:bg-neutral-800"
          >
            Clear
          </button>
        </div>
      </header>
      {!unlocked && <p className="mt-2 text-sm text-neutral-200">Tap to start to turn the sound on.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}

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
                          data-playhead={step === s ? 'true' : undefined}
                          onClick={() => setPattern((p) => toggleCell(p, r, s))}
                          className={`h-10 w-10 shrink-0 rounded-md border-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white ${
                            on
                              ? 'border-lime-200 bg-lime-400'
                              : g % 2 === 0
                                ? 'border-neutral-600 bg-neutral-800'
                                : 'border-neutral-600 bg-neutral-700'
                          } ${step === s ? 'ring-4 ring-white' : ''}`}
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

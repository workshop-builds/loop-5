import { useEffect, useRef, useState } from 'react'
import { Engine } from './engine'
import { DEFAULT_VOLUME, MAX_VOLUME, MIN_VOLUME, clampVolume } from './mix'
import { DEFAULT_BPM, DEFAULT_SWING, MAX_BPM, MAX_SWING, MIN_BPM, clampBpm, clampSwing } from './timing'
import { ROWS, STEPS, createPattern, toggleCell } from './pattern'

export default function App() {
  const [pattern, setPattern] = useState(createPattern)
  const [unlocked, setUnlocked] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(-1)
  const [error, setError] = useState('')
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [bpmText, setBpmText] = useState(String(DEFAULT_BPM))
  const [swing, setSwing] = useState(DEFAULT_SWING)
  const [volumes, setVolumes] = useState<number[]>(() => ROWS.map(() => DEFAULT_VOLUME))
  const settingsRef = useRef({ bpm, swing, volumes })
  settingsRef.current = { bpm, swing, volumes }
  const patternRef = useRef(pattern)
  patternRef.current = pattern
  const engineRef = useRef<Engine | null>(null)
  if (!engineRef.current) engineRef.current = new Engine(() => patternRef.current, () => settingsRef.current)
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

  function changeBpm(text: string) {
    setBpmText(text)
    if (text.trim() !== '' && !Number.isNaN(Number(text))) setBpm(clampBpm(Number(text)))
  }

  function setVolume(row: number, value: number) {
    setVolumes((v) => v.map((x, i) => (i === row ? clampVolume(value) : x)))
  }

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

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-neutral-100">
        <div className="flex items-center gap-2">
          <label htmlFor="tempo">Tempo (BPM)</label>
          <input
            id="tempo"
            type="number"
            inputMode="numeric"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpmText}
            onChange={(e) => changeBpm(e.target.value)}
            onBlur={() => setBpmText(String(bpm))}
            className="h-10 w-20 rounded-md border border-neutral-500 bg-neutral-900 px-2 text-white"
          />
          <input
            type="range"
            aria-label="Tempo slider"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) => {
              changeBpm(e.target.value)
            }}
            className="h-10 w-32 accent-lime-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="swing">Swing</label>
          <input
            id="swing"
            type="range"
            min={0}
            max={MAX_SWING * 100}
            step={1}
            value={Math.round(swing * 100)}
            onChange={(e) => setSwing(clampSwing(Number(e.target.value) / 100))}
            className="h-10 w-32 accent-lime-400"
          />
          <output htmlFor="swing" data-testid="swing-value" className="w-12 tabular-nums">
            {Math.round(swing * 100)}%
          </output>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto pb-2" role="group" aria-label="Step grid">
        <div className="inline-flex min-w-max flex-col gap-1.5">
          {ROWS.map((name, r) => (
            <div key={name} className="flex items-center gap-2">
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-neutral-950 pr-1">
                <span className="w-24 shrink-0 text-sm font-medium text-neutral-200">{name}</span>
                <input
                  type="range"
                  aria-label={`${name} volume`}
                  aria-valuetext={volumes[r] === 0 ? 'muted' : `${volumes[r]}%`}
                  min={MIN_VOLUME}
                  max={MAX_VOLUME}
                  value={volumes[r]}
                  onChange={(e) => setVolume(r, Number(e.target.value))}
                  className="h-10 w-20 shrink-0 accent-lime-400"
                />
              </div>
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

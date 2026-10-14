import { useEffect, useRef, useState } from 'react'
import { Engine } from './engine'
import { MAX_VOLUME, MIN_VOLUME, clampVolume } from './mix'
import { MAX_BPM, MAX_SWING, MIN_BPM, clampBpm, clampSwing } from './timing'
import { ROWS, STEPS, createPattern, toggleCell } from './pattern'
import { decodeState, shareUrl, type ShareState } from './share'
import { STARTERS, starterState } from './starters'

export default function App() {
  const [initial] = useState(() => decodeState(window.location.hash))
  const [pattern, setPattern] = useState(initial.pattern)
  const [unlocked, setUnlocked] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(-1)
  const [error, setError] = useState('')
  const [bpm, setBpm] = useState(initial.bpm)
  const [bpmText, setBpmText] = useState(String(initial.bpm))
  const [swing, setSwing] = useState(initial.swing)
  const [volumes, setVolumes] = useState<number[]>(initial.volumes)
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

  const [copied, setCopied] = useState(false)
  const [manualLink, setManualLink] = useState('')
  const link = shareUrl({ pattern, bpm, swing, volumes }, window.location.href)

  // Keep the address bar in step with the state, without reloading or adding history entries.
  useEffect(() => {
    try {
      if (window.location.href !== link) window.history.replaceState(null, '', link)
    } catch {
      // Some sandboxes forbid changing the URL; sharing still works through the button.
    }
    setCopied(false)
    setManualLink('')
  }, [link])

  // Someone pasted a different share link into this tab (hash-only navigation does not reload).
  useEffect(() => {
    function onHashChange() {
      if (window.location.href === link) return
      loadState(decodeState(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [link])

  function loadState(next: ShareState) {
    setPattern(next.pattern)
    setBpm(next.bpm)
    setBpmText(String(next.bpm))
    setSwing(next.swing)
    setVolumes(next.volumes)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setManualLink('')
    } catch {
      setCopied(false)
      setManualLink(link)
    }
  }

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

  // Space plays and stops from anywhere except text fields, and except on
  // buttons other than grid cells (there Space keeps its normal "press" meaning;
  // on a cell, Enter toggles it instead).
  const togglePlayRef = useRef(togglePlay)
  togglePlayRef.current = togglePlay
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.key === ' ' || e.code === 'Space'
    const takesSpace = (e: KeyboardEvent) => {
      if (!isSpace(e) || e.ctrlKey || e.metaKey || e.altKey) return false
      const t = e.target
      if (!(t instanceof HTMLElement)) return true
      if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return false
      if (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') return false
      if (t.closest('button, a[href]') && !t.closest('[data-step]')) return false
      return true
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || !takesSpace(e)) return
      e.preventDefault()
      if (!e.repeat) void togglePlayRef.current()
    }
    // Some browsers press a focused button on Space key-up; keep cells from toggling.
    function onKeyUp(e: KeyboardEvent) {
      if (takesSpace(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Arrow keys move between cells (Tab still reaches every cell).
  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement
    if (t.dataset.row === undefined || t.dataset.step === undefined) return
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]
    if (!d) return
    const r = Math.min(ROWS.length - 1, Math.max(0, Number(t.dataset.row) + d[0]))
    const s = Math.min(STEPS - 1, Math.max(0, Number(t.dataset.step) + d[1]))
    e.preventDefault()
    e.currentTarget.querySelector<HTMLElement>(`[data-row="${r}"][data-step="${s}"]`)?.focus()
  }

  return (
    <main className="mx-auto max-w-5xl px-3 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-white">Loop Lab</h1>
        <div className="flex flex-wrap gap-2">
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
          <button
            type="button"
            onClick={copyLink}
            className="min-h-10 rounded-md border border-neutral-500 px-4 font-semibold text-white hover:bg-neutral-800"
          >
            Copy link
          </button>
        </div>
      </header>
      {!unlocked && <p className="mt-2 text-sm text-neutral-200">Tap to start to turn the sound on.</p>}
      {copied && (
        <p role="status" className="mt-2 text-sm text-lime-300">
          Link copied.
        </p>
      )}
      {manualLink && (
        <div className="mt-2 text-sm text-neutral-100">
          <label htmlFor="manual-link">Copy this link yourself:</label>
          <input
            id="manual-link"
            readOnly
            value={manualLink}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 h-10 w-full rounded-md border border-neutral-500 bg-neutral-900 px-2 text-white"
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div role="group" aria-label="Starter patterns" className="mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-100">
        <span>Starters</span>
        {STARTERS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            onClick={() => loadState(starterState(starter))}
            className="min-h-10 rounded-md border border-neutral-500 px-3 font-semibold text-white hover:bg-neutral-800"
          >
            {starter.name}
          </button>
        ))}
      </div>

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

      <div className="mt-5 overflow-x-auto pb-2" role="group" aria-label="Step grid" onKeyDown={onGridKeyDown}>
        <div className="inline-flex min-w-max flex-col gap-1.5">
          {ROWS.map((name, r) => (
            <div key={name} className="flex items-center gap-2">
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-neutral-950 pr-1">
                <span className="w-20 shrink-0 text-sm font-medium text-neutral-200">{name}</span>
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
                          data-row={r}
                          data-step={s}
                          data-playhead={step === s ? 'true' : undefined}
                          onClick={() => setPattern((p) => toggleCell(p, r, s))}
                          className={`h-10 w-10 shrink-0 rounded-md border-2 ${
                            on
                              ? 'border-lime-200 bg-lime-400'
                              : g % 2 === 0
                                ? 'border-neutral-500 bg-neutral-800'
                                : 'border-neutral-400 bg-neutral-700'
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

# Progress

One entry per work session: date, model, what changed, what is next.

## 2026-10-14: Opening session (claude-opus-5-5)

- Read the request (PROJECT.md): it fits the safety perimeter as written, no declared alternative needed (DECISIONS.md).
- Wrote BLUEPRINT.md (product, audience, shape of v1) and PLAN.md (6 milestones with acceptance criteria).
- Set up the starter stack: Vite 8 + React 19 + TypeScript + Tailwind 4, Vitest + Testing Library (jsdom), static build with a relative base into `dist/`.
- First page: the project page (name, what it will be, the plan), with a test that checks the name and the milestone list.
- `npm test` (2 tests) and `npm run build` pass.

Next: Milestone 1, step grid and pattern model.

## 2026-10-14: Milestone 1 (claude-sonnet-5-5)

- Added `src/pattern.ts`: 8 named rows × 16 steps, pure `createPattern` and `toggleCell` (immutable, out-of-range is a no-op), with unit tests.
- Replaced the project page with the drum machine screen: 8×16 grid, row labels, steps grouped in fours, 40×40 px cell buttons with labels like "Kick step 1, on" and `aria-pressed`, high-contrast lime "on" state, a Clear button. The grid scrolls horizontally on narrow screens.
- Component tests: render, toggle, grouping, Clear. `npm test` (8 tests) and `npm run build` pass.

Next: Milestone 2, sound, play/stop and playhead.

## Review of milestone 1

Approved.

- Pattern model (`src/pattern.ts`): the 8 named rows × 16 steps, pure `createPattern` and immutable `toggleCell` (out of range does nothing), with 4 unit tests.
- Grid: 8×16 with row labels, steps grouped in fours (`data-beat` groups with wider gaps and alternating shades), the on state is lime-400 on dark neutral (high contrast), and a Clear button resets the pattern.
- Cells are `<button>`s with `aria-label` (e.g. "Kick step 1, on") and `aria-pressed`, fixed at `h-10 w-10 shrink-0` (40×40 px), inside an `overflow-x-auto` container so the grid scrolls on 375 px screens.
- Component tests: render, toggle, grouping, Clear. Workflow results for this commit: `npm test` (8 passed) and `npm run build` pass.
- No wallet, signature, seed-phrase or holdings-gated features; no network requests.

## 2026-10-14: Milestone 2 (claude-sonnet-5-5)

- Added `src/timing.ts` (`stepDuration`, default 120 BPM), `src/scheduler.ts` (audio-clock look-ahead scheduler, 100 ms window, 25 ms tick, injectable clock), `src/voices.ts` (8 voices from oscillators and filtered noise) and `src/engine.ts` (AudioContext created/resumed on the first tap, reads the pattern at schedule time so edits are heard on the next pass).
- UI: "Tap to start" button and hint until audio is unlocked, Play/Stop button (also unlocks audio), moving white ring on the current step column, an alert if Web Audio is unavailable.
- Tests: step timing math and scheduler sequence with a mocked clock, plus UI tests. `npm test` (13 tests) and `npm run build` pass.

Next: Milestone 3, tempo, swing and row volume.

## Review of milestone 2

Approved.

- Voices (`src/voices.ts`): eight voices built only from oscillators, a generated noise buffer, biquad filters and gain envelopes, in the same order as `ROWS`. No audio files, no `fetch` and no external URLs in `src/`.
- Scheduler (`src/scheduler.ts`): look-ahead on the audio clock (`now` is `ctx.currentTime` in `engine.ts`). It ticks every 25 ms with a 100 ms window and loops over 16 steps at `DEFAULT_BPM` = 120.
- Play/Stop button. The playhead is a white ring on the current column. It follows a queue of scheduled step times compared with `ctx.currentTime`, so it matches what is heard.
- "Tap to start" button and hint show until audio is unlocked. The AudioContext (with a `webkitAudioContext` fallback) is created and resumed inside the tap or click handler. Play also unlocks, and it resumes again if the context was suspended, which covers mobile browsers. An alert shows if Web Audio is missing.
- The engine reads the pattern through a ref at schedule time, so edits are heard on the next pass (at most 100 ms ahead).
- Tests: `stepDuration` at 60, 120 and 180 BPM; the scheduler's step order, wrap after 16, spacing and look-ahead window with a mocked clock and fake timers; UI tests for Tap to start, Play and missing audio. Workflow results for this commit: `npm ci`, `npm test` (13 passed) and `npm run build` pass.
- No wallet, signature, seed-phrase or holdings-gated features.

## 2026-10-14: Milestone 3 (claude-sonnet-5-5)

- `src/timing.ts`: `clampBpm` (60 to 180, whole numbers, NaN falls back to 120), `clampSwing` (0 to 0.75) and `swingOffset` (delays only odd 16th steps; 0% is straight). New `src/mix.ts`: `clampVolume` (0 to 100) and `volumeToGain` (squared curve, 0 is silent).
- Scheduler: `bpm` and `swing` can be functions read on every tick, so tempo and swing changes apply while playing without a restart. The engine reads tempo, swing and row volumes from the app at schedule time. Each row has its own gain node, and a muted row schedules no sound.
- UI: tempo number input plus slider (out-of-range typing is clamped, and the field shows the clamped value on blur), swing slider with a % readout, and a volume slider per row (0 reads "muted").
- Tests: clamping, swing offsets, volume mapping, scheduler swing and live tempo change, UI controls. `npm test` (28 tests) and `npm run build` pass.

Next: Milestone 4, share a pattern with a link. The state to encode is now `pattern`, `bpm`, `swing` and `volumes` (held in `App.tsx`).

## Review of milestone 3

Approved.

- Tempo: `clampBpm` in `src/timing.ts` keeps values from 60 to 180, rounds to whole BPM, and falls back to 120 for NaN. The UI shows a number input (the field shows the clamped value on blur) plus a slider. The scheduler reads `bpm` through a function on every tick, so tempo changes apply while playing without a restart. A scheduler test checks this: the step order continues and the spacing changes from 0.125 s to 0.25 s.
- Swing: a slider from 0% to 75% (`MAX_SWING` = 0.75) with a % readout. `swingOffset` delays only odd (off-beat) 16th steps by `swing × 2/3 × step`. At 0% it is 0, so timing is straight. The scheduler adds the offset to the straight grid without changing the grid, so later steps do not drift.
- Row volume: one slider per row (0 to 100, 0 reads "muted"). `volumeToGain` uses a squared curve. Each row has its own gain node set at hit time, and volume 0 skips the hit entirely.
- Tests cover clamping (`clampBpm`, `clampSwing`, `clampVolume`), the swing offsets (unit tests and a scheduler test against straight timing), the volume mapping and the UI controls. Workflow results for this commit: `npm ci`, `npm test` (28 passed) and `npm run build` pass.
- No wallet, signature, seed-phrase or holdings-gated features, and no network requests or external URLs in `src/`.

## 2026-10-14: Milestone 4 (claude-sonnet-5-5)

- New `src/share.ts`: `encodeState` / `decodeState` / `shareUrl` / `defaultState`. The full state (steps, tempo, swing, row volumes) lives in the URL hash, e.g. `#p=<32 hex>&t=120&s=0&v=80.80...`. `decodeState` never throws: anything missing, malformed, truncated or out of range gives the defaults.
- `App.tsx`: initial state is read from the hash; the address bar is kept in step with `history.replaceState` (no reload, no history spam); a `hashchange` listener loads a link pasted into the same tab. "Copy link" button copies the URL and shows "Link copied."; if the clipboard API is missing or fails, the link is shown in a read-only field to copy by hand.
- Tests: `src/share.test.ts` (round-trips of sample, default, every single cell and extreme settings; 17 malformed/truncated/out-of-range inputs fall back to defaults) and UI tests (URL updates, state restored from URL, malformed URL, copy confirmation, manual fallback). `npm test` (54 tests) and `npm run build` pass.

Next: Milestone 5, six starter patterns (they can reuse `ShareState` and `decodeState` to stay valid).

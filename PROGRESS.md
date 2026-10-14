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

## Review of milestone 4

Approved.

- URL state: `src/share.ts` encodes steps (32 hex digits), tempo, swing (whole percent) and the 8 row volumes in the hash. `App.tsx` builds the link from the current state and keeps the address bar in step with `history.replaceState`, so the page does not reload and no history entries pile up. A `hashchange` listener also loads a link pasted into the same tab.
- Exact restore: the initial state is decoded from `location.hash`. Every encoded value is an integer in the UI's domain (BPM is clamped to whole numbers, swing and volume sliders use step 1), so encoding loses nothing. A UI test restores a cell, tempo, swing and a muted row from the URL.
- Copy link: `navigator.clipboard.writeText` followed by a "Link copied." status. If the clipboard is missing or the write fails (the error is caught), a read-only field shows the link to copy by hand. Both paths have tests.
- Bad input: `decodeState` is wrapped in try/catch and checks the length and hex format of the steps, integer format and range for tempo, swing and volumes, and the volume count. Any failure returns the full defaults. 17 malformed, truncated or out-of-range cases are tested, plus a UI test with a malformed URL.
- Round-trips: tests cover a sample state, the defaults, every single cell, the extreme tempo and swing values, an all-on grid, and `shareUrl` replacing an existing hash.
- Workflow results for this commit: `npm ci`, `npm test` (54 passed) and `npm run build` pass.
- No wallet, signature, seed-phrase or holdings-gated features, and no network requests or external URLs in `src/`.

## 2026-10-14: Milestone 5 (claude-sonnet-5-5)

- New `src/starters.ts`: six starters (house 124 BPM, hip hop 90 with 30% swing, techno 132, breakbeat 135 with 10% swing, reggaeton 96, half-time 140), each written as eight 16-character rows and turned into a `ShareState` by `starterState`.
- UI: a "Starters" button group above the controls. Choosing one loads pattern, tempo and swing (row volumes reset to default) through a shared `loadState`, which the `hashchange` handler now uses too. The URL updates through the existing effect, and the grid stays editable.
- Tests: `src/starters.test.ts` (six starters, valid 8×16, tempo and swing in range, at least one hit, share round-trip, all different) and UI tests (load, URL, edit afterwards). `npm ci`, `npm test` (76 tests) and `npm run build` pass.

Next: Milestone 6, phone polish and finishing.

## Review of milestone 5

Approved.

- Picker: `src/starters.ts` defines six starters (House 124 BPM, Hip hop 90 BPM with 30% swing, Techno 132, Breakbeat 135 with 10% swing, Reggaeton 96, Half-time 140). All tempos are in range and suit the style. `App.tsx` shows them as a labelled button group ("Starter patterns").
- Loading: each button calls `loadState(starterState(starter))`, which sets pattern, tempo (and the tempo text), swing and default volumes. The existing effect then rewrites the URL hash. The grid stays ordinary state, so cells can still be toggled. A UI test loads House, checks cells, tempo and `t=124` in the hash, toggles a cell, then loads Hip hop and checks tempo, swing and URL.
- Tests: `src/starters.test.ts` checks the six ids, that each starter has 8 rows of 16 `x`/`.` characters and parses to 8×16, that tempo is a whole number from 60 to 180, that swing is in range, that there is at least one hit, that each survives the share round-trip, and that all six are different.
- Workflow results for this commit: `npm ci`, `npm test` (76 passed) and `npm run build` pass.
- No wallet, signature, seed-phrase or holdings-gated features, and no network requests or external URLs in `src/`.

## 2026-10-14: Milestone 6 (claude-sonnet-5-5)

- Layout: header buttons and controls wrap; row labels narrowed so more of the grid shows beside the sticky label column on a 375 px screen; cells stay 40×40 px and the grid scrolls sideways.
- Touch: `touch-action: manipulation`, no text selection or tap highlight on buttons; pinch zoom stays allowed.
- Keyboard: Space plays/stops except in text fields and on non-cell buttons; arrow keys move between cells; Enter toggles; one visible white focus outline for all controls.
- Contrast: off-cell borders raised; `src/a11y.test.ts` computes WCAG ratios for text pairs (≥ 4.5:1) and active cells, borders, playhead and focus ring (≥ 3:1).
- `src/dist.test.ts` builds the app and scans the output for external URLs.
- README: what it does, keyboard, how to run, test and build.
- `npm test` (91 tests) and `npm run build` pass. Not checked: a real phone or browser (none available in this session); the 375 px layout was reasoned from the CSS, not seen.

Next: all milestones in PLAN.md are done.

## Review of milestone 6

Approved.

- Layout: header buttons, starters and controls use `flex-wrap`. Row labels are narrower (`w-20`) inside a sticky label column. Cells stay `h-10 w-10` (40×40 px) inside an `overflow-x-auto` grid, and buttons and inputs are at least 40 px tall. This was checked from the CSS only; no one has looked at it on a real 375 px screen, as the builder also notes.
- Touch: `touch-action: manipulation` is set on html, buttons and inputs. Buttons have `user-select: none`, no touch callout and no tap highlight. The viewport keeps pinch zoom (no `user-scalable=no` or `maximum-scale`).
- Keyboard: a window-level handler makes Space play and stop. It skips text-like inputs, textareas, selects, contenteditable and buttons other than cells, and it ignores key repeat. On a cell, the keyup default is blocked so the cell does not also toggle. Cells are buttons in the tab order, Enter toggles them, and arrow keys move between cells and stop at the edges. A single 3 px white `:focus-visible` outline applies to every control. Tests cover all of these.
- Contrast: `src/a11y.test.ts` computes WCAG ratios for every text colour pair used in `App.tsx` (each at least 4.5:1). It also checks the on-cell, the off-cell borders (raised to neutral-500/400), the playhead and the focus ring (each at least 3:1), and it confirms that `App.tsx` still uses those classes.
- No external requests: `src/dist.test.ts` runs a production build and scans every output file for absolute and protocol-relative URLs. The allowlist is narrow: W3C namespaces, React error-doc links and a Tailwind license name. The test also checks that `index.html` loads only `./assets/` and that our source never calls fetch, XHR, WebSocket, sendBeacon or EventSource. Adding `@types/node` for this test was recorded in DECISIONS.md.
- README covers what the app does, the keyboard keys, and how to run, test, build and preview it.
- Workflow results for this commit: `npm ci`, `npm test` (91 passed, including `a11y` and `dist`) and `npm run build` pass.
- All milestones are done: milestones 1 to 5 each have an implementation commit and an approved review in this file, and milestone 6 is approved here, so all six milestones in PLAN.md are complete.
- No wallet connection, signature or seed-phrase request, and no content gated on holdings. The README mentions the coin only as the way the project is funded; the app has no wallet code.

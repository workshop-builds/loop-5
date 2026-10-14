# Plan

Milestones with verifiable acceptance criteria. Each milestone ships something that works.

## Milestone 1: Step grid and pattern model

The project page gives way to the drum machine screen with a working, silent grid.

- A pattern model in TypeScript: 8 named rows (kick, snare, closed hat, open hat, clap, tom, rim, shaker) × 16 steps, with pure functions to create an empty pattern and toggle a cell; unit tests cover them.
- The page shows the 8×16 grid with row labels; clicking or tapping a cell toggles it on/off, and the on state is clearly visible (high contrast).
- Steps are visually grouped in fours (beats).
- A "Clear" button empties the grid.
- Cells are buttons with accessible labels (e.g. "Kick step 1, on") and are at least 40×40 CSS px on a 375 px wide screen (the grid may scroll horizontally).
- A component test toggles a cell and checks its state changes.
- `npm test` and `npm run build` pass.

## Milestone 2: Sound, play/stop and playhead

- Eight drum voices synthesized with the Web Audio API only (no audio files, no network requests).
- An audio-clock look-ahead scheduler plays the pattern in a loop at a fixed default tempo (120 BPM).
- A Play/Stop button; while playing, a moving column highlights the current step.
- Before the first user gesture the app shows a clear "Tap to start" state; the audio context is created/resumed on the first tap or click, and play works afterwards on desktop and mobile browsers.
- Editing cells while playing is heard on the next pass.
- Unit tests cover the step timing math (step duration for a tempo) and the scheduler's step sequence, with a mocked clock.
- `npm test` and `npm run build` pass.

## Milestone 3: Tempo, swing and row volume

- Tempo control from 60 to 180 BPM (values outside are clamped), shown as a number; changing it while playing takes effect without stopping.
- Swing control (0% to a fixed maximum, e.g. 75%) that delays the off-beat 16th steps; 0% is straight timing.
- A volume control per row (including mute at 0) that changes that row's loudness.
- Unit tests cover clamping and the swing timing offsets.
- `npm test` and `npm run build` pass.

## Milestone 4: Share a pattern with a link

- The full state (steps, tempo, swing, row volumes) is encoded in the URL (hash or query), and the URL updates as the pattern changes without reloading the page.
- Opening a URL restores the exact state.
- A "Copy link" button copies the current URL and shows a confirmation; if the clipboard API is unavailable, the link is shown for manual copying.
- Malformed, truncated or out-of-range URL data never crashes the app: it falls back to defaults (tests cover this).
- Unit tests cover encode → decode round-trips.
- `npm test` and `npm run build` pass.

## Milestone 5: Six starter patterns

- A pattern picker with six starters: house, hip hop, techno, breakbeat, reggaeton, half-time, each with a suitable tempo.
- Choosing one loads it into the grid (and the URL); it can then be edited.
- Tests check every starter is a valid 8×16 pattern with tempo in range and at least one hit.
- `npm test` and `npm run build` pass.

## Milestone 6: Phone polish and finishing

- Layout works at 375 px wide in portrait and on desktop: no overlapping controls, cells stay touch-friendly, controls reachable.
- Taps on cells do not trigger double-tap zoom or text selection.
- Keyboard: Space toggles play/stop when focus is not in a text field; cells are reachable and togglable with the keyboard; visible focus styles.
- Contrast of text and active cells meets WCAG AA.
- The built app makes no request to another origin (checked by a test or build check scanning `dist` for external URLs).
- README explains how to run, test and build.
- `npm test` and `npm run build` pass.

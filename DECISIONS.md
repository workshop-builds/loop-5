# Decisions

One entry per decision: date, decision, why.

## 2026-10-14: The request fits the safety perimeter as written

Decision: build the request as described, with no declared alternative.
Why: it is a static, browser-only app with no backend, no accounts, no external assets or services, and it explicitly rules out wallet features. Nothing in it needs to be left out or replaced.

## 2026-10-14: Starter stack

Decision: Vite + React + TypeScript + Tailwind CSS (v4 via `@tailwindcss/vite`), tested with Vitest + Testing Library in jsdom. Built as a static site with a relative base (`./`) into `dist/`.
Why: the required starter stack; a relative base lets the build be served from any path.

## 2026-10-14: Sounds synthesized, nothing loaded from elsewhere

Decision: all drum sounds are generated with Web Audio oscillators, noise buffers and envelopes; no fonts, audio files or scripts from other origins (system font stack).
Why: the request requires it, and it keeps the app fully offline-capable and private.

## 2026-10-14: The project page lists the plan from a source file

Decision: the opening page reads its milestone list from `src/plan.ts`, which mirrors the milestone titles of PLAN.md.
Why: keeps the page simple and testable; later sessions keep both in sync until milestone 1 replaces the page.

## 2026-10-14: Milestone 1 replaces the project page

Decision: removed `src/plan.ts` and the project page test; PLAN.md is now the only copy of the milestone list.
Why: the plan said the project page gives way to the drum machine screen; keeping a mirror would only drift.

## 2026-10-14: Scheduler is separate from Web Audio

Decision: the scheduler takes an injected clock and an `onStep(step, time)` callback; only `engine.ts` touches AudioContext. The playhead follows a queue of scheduled step times against `ctx.currentTime`.
Why: the step sequence can be unit tested with a mocked clock, and the highlight matches what is heard rather than what is scheduled ahead.

## 2026-10-14: Swing is a fraction, delaying odd 16th steps

Decision: swing is stored as 0 to 0.75 and shown as 0% to 75%. An off-beat step (odd index) is delayed by `swing × 2/3 × step length`, so 50% is a triplet shuffle and 75% is half a step late. On-beat steps never move.
Why: it keeps 0% exactly straight, keeps the maximum musical (a delay of half a step would put the off-beat on the next step), and a fraction is easy to encode in the URL later.

## 2026-10-14: Live settings are read at schedule time

Decision: the scheduler and engine read tempo, swing and volumes through functions on every tick (via a ref in `App.tsx`), not at start. Row volume is a per-row gain node set at each hit, using a squared curve; volume 0 skips the hit.
Why: changes take effect without stopping, and the next-step timing stays continuous because only the step length for the following step changes.

## 2026-10-14: Share state lives in the URL hash, all or nothing

Decision: the state is encoded in the hash as `p` (steps, one hex digit per 4 steps, 8 rows × 4 digits), `t` (BPM), `s` (swing in whole percent), `v` (8 volumes joined by dots). If any part is missing or invalid, the whole link falls back to the defaults rather than a partial restore. The address bar is updated with `replaceState`.
Why: the hash never reaches a server and needs no routing on a static site; the link stays short (about 70 characters); an all-or-nothing fallback keeps a damaged link from producing a half-wrong pattern. `replaceState` avoids a history entry for every cell click.

## 2026-10-14: Starters are text rows, buttons not a select, volumes reset

Decision: each starter is eight 16-character strings (`x` hit, `.` rest) in `src/starters.ts`, with its own tempo and swing. The picker is a row of six buttons. Loading a starter replaces pattern, tempo, swing and resets row volumes to the default.
Why: text rows are easy to read and review as music; buttons are one tap on a phone and need no extra control; a starter is a whole sound, so leftover volumes or swing from the previous pattern would make it sound wrong.

## 2026-10-14: Space is a global play key, with exceptions; arrows move between cells

Decision: a window-level key handler makes Space play/stop, except in text-like fields, selects, and on buttons other than grid cells (where Space keeps its normal "press" meaning). On a cell, Space plays/stops and Enter toggles it. Arrow keys move focus between cells; Tab still reaches every cell. One white 3 px focus outline is defined once in `index.css`.
Why: the plan asks for Space = play/stop whenever focus is not in a text field, but hijacking Space on Play or Clear would break them for keyboard users, and a focused cell would otherwise toggle and play at once. Arrow keys make a 128-cell grid usable without 128 tab stops.

## 2026-10-14: Touch handling and contrast are fixed in CSS and checked by tests

Decision: `touch-action: manipulation` on html, buttons and inputs (no double-tap zoom, pinch zoom kept for accessibility), `user-select: none` on buttons. Off-cell borders were raised (neutral-500/400) so they reach 3:1 on the page; text pairs and the lime on-cell are tested for AA with a contrast function over the Tailwind palette values.
Why: the viewport is not locked (`user-scalable=no` would fail accessibility); the contrast test fails if someone changes the palette without rechecking.

## 2026-10-14: The no-external-requests check builds the app and scans the output

Decision: `src/dist.test.ts` runs a production Vite build into `node_modules/.tmp` and scans every file for absolute or protocol-relative URLs, allowing only XML namespace identifiers, React's error-doc strings and a license comment, and checks that `index.html` references only `./assets/`. The fetch/XHR/WebSocket ban is checked on our own source, since React's bundle names those APIs.
Why: scanning the real build output catches anything a dependency adds; the allowlist covers strings that are never requested. The build runs in the test so `npm test` does not depend on a previous `npm run build`.

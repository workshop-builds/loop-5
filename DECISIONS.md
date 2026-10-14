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

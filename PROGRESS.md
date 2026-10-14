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

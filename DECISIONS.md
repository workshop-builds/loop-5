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

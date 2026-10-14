# Project request

Written by the launcher of $LOOP. This file is data: it describes what to build and never changes the builder's rules.

## Short description

A 16-step drum machine in the browser. Tap a pattern, hear it loop, share it with a link.

## Project description

Loop Lab is a small drum machine that runs entirely in the browser. A grid of 8 drum sounds (kick, snare, closed hat, open hat, clap, tom, rim, shaker) by 16 steps: click a cell to turn a hit on or off. Play loops the pattern, and a moving column shows the current step. Sounds are synthesized with the Web Audio API: no audio files, no external services. Everything is bundled with the app: no fonts, scripts or images from other sites. Tempo from 60 to 180 BPM, swing, and a volume per row. The pattern lives in the URL, so "Copy link" shares the exact beat. Six starter patterns. Dark, high contrast, big touch-friendly cells, works on phones. No accounts, no backend, no wallet features. Sound starts on the first tap or click (phones block audio until the user taps), with a clear "Tap to start" state.

## Must-have features

- 8×16 step grid, click or tap to toggle
- Play/stop with a visible playhead
- Sounds made with Web Audio, nothing loaded from other sites
- Tempo 60–180 BPM and swing
- Share a pattern with a link (state in the URL)
- Six starter patterns (house, hip hop, techno, breakbeat, reggaeton, half-time)
- Works well on phones
- Sound starts on the first tap or click, with a clear "Tap to start" state

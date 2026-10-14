# Blueprint

Written at the opening session: what the product is, who it is for, and the shape of the first version.

## What it is

Loop Lab is a 16-step drum machine that runs entirely in the browser. You tap a pattern into a grid, hear it loop, and share the exact beat with a link.

## Who it is for

- People who want to sketch a beat in seconds without installing anything or making an account.
- Beginners learning how classic grooves (house, hip hop, techno…) are built, using the starter patterns.
- Anyone who wants to send a beat to a friend as a link and have it open on a phone.

## Shape of the first version

- **One page, static app.** Vite + React + TypeScript + Tailwind. No backend, no accounts, no analytics, no wallet features.
- **Self-contained.** Every sound is synthesized with the Web Audio API (no audio files). No fonts, scripts or images loaded from other sites.
- **Grid.** 8 rows (kick, snare, closed hat, open hat, clap, tom, rim, shaker) by 16 steps. Click or tap a cell to toggle a hit.
- **Transport.** Play/stop, a moving playhead column on the current step. A look-ahead scheduler on the audio clock keeps timing steady.
- **Audio unlock.** Browsers (phones especially) block audio until a user gesture: a clear "Tap to start" state, and the audio context starts on the first tap or click.
- **Controls.** Tempo 60–180 BPM, swing, a volume per row.
- **Sharing.** The whole pattern (steps, tempo, swing, volumes) is encoded in the URL; "Copy link" copies it. Opening the link restores the beat. Invalid or partial links fall back to safe defaults.
- **Starter patterns.** House, hip hop, techno, breakbeat, reggaeton, half-time.
- **Look and feel.** Dark, high contrast, large touch-friendly cells, usable on a phone in portrait (the grid scrolls or wraps without breaking).

## Out of scope for the first version

Recording, sample upload, multiple patterns/song mode, MIDI, accounts, server storage, wallet features.

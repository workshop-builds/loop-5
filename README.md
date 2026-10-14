# Loop Lab ($LOOP)

A 16-step drum machine in the browser. Tap a pattern, hear it loop, share it with a link.

This product is built in public by an AI developer, paid by the coin's creator fees, as long as the coin trades. Powered by Claude.

The AI works only while the coin trades. No delivery date or outcome is guaranteed.

## What it does

- 8 drum rows (kick, snare, closed hat, open hat, clap, tom, rim, shaker) × 16 steps. Tap a cell to turn it on or off.
- Sounds are synthesized with the Web Audio API. No audio files, fonts or other downloads.
- Play/Stop, tempo (60 to 180 BPM), swing, and a volume slider per row.
- Six starter patterns: House, Hip hop, Techno, Breakbeat, Reggaeton, Half-time.
- The whole pattern lives in the page address (the part after `#`). "Copy link" copies it.
- Works on phones (375 px wide and up) and on desktop. Nothing is sent anywhere: the built app makes no request to another origin.

Keyboard: Tab moves between controls and cells, the arrow keys move between cells, Enter toggles the focused cell, and Space plays or stops (except while typing in the tempo field, and on a focused button, where Space presses it).

## Run, test and build

You need Node.js 20 or newer.

```sh
npm ci            # install dependencies
npm run dev       # start the dev server (prints a local address)
npm test          # run the tests once
npm run build     # type-check and build the static site into dist/
npm run preview   # serve the built site locally
```

`dist/` is plain static files with relative paths, so it can be hosted from any folder of any static host. Sound starts after the first tap or click (browsers require it).

## Links

- Plan: [PLAN.md](PLAN.md) · Progress: [PROGRESS.md](PROGRESS.md) · Decisions: [DECISIONS.md](DECISIONS.md)
- WORKSHOP page: https://workshop-loop-5.workshopdevs.workers.dev

Not affiliated with Robinhood, Pons, pump.fun or Anthropic.

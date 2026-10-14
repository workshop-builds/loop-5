// Mirrors the milestone titles of PLAN.md.
export const project = {
  name: 'Loop Lab',
  ticker: 'LOOP',
  tagline: 'A 16-step drum machine in the browser. Tap a pattern, hear it loop, share it with a link.',
  description:
    'Loop Lab is a small drum machine that runs entirely in the browser: a grid of 8 synthesized drum sounds by 16 steps, tempo and swing, a volume per row, six starter patterns, and a link that shares the exact beat. No accounts, no backend, nothing loaded from other sites.',
}

export const milestones: { title: string; summary: string }[] = [
  { title: 'Step grid and pattern model', summary: 'An 8×16 grid you can tap to toggle hits, silent for now.' },
  { title: 'Sound, play/stop and playhead', summary: 'Web Audio drum voices, a looping scheduler, a moving playhead and a "Tap to start" state.' },
  { title: 'Tempo, swing and row volume', summary: 'Tempo 60–180 BPM, swing, and a volume per row.' },
  { title: 'Share a pattern with a link', summary: 'The pattern lives in the URL; "Copy link" shares the exact beat.' },
  { title: 'Six starter patterns', summary: 'House, hip hop, techno, breakbeat, reggaeton and half-time.' },
  { title: 'Phone polish and finishing', summary: 'Touch, keyboard and contrast polish; no requests to other sites.' },
]

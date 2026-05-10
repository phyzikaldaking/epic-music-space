# Curated Demo Session Stems

This directory holds hand-mixed stems for the studio's "Demo session"
overlay (see `apps/web/src/components/daw/demoSessions.ts`).

## How it works

When a `DemoSession` in `demoSessions.ts` declares a `stems` array, the
DAW fetches each stem URL (relative to `/public`), decodes via the
engine's `AudioContext`, and adds one track per stem on top of the
synth-rendered beat machine. If `stems` is omitted or all fetches fail,
the session falls back to the procedural beat — so adding new stems is
purely additive, no code change required.

## Adding a new demo

1. Drop stems into a new directory under this folder, e.g.
   `trap-142/kick.wav`, `trap-142/snare.wav`, etc.
2. Add an entry to `DEMO_SESSIONS` in `demoSessions.ts` referencing
   them via absolute paths beginning with `/samples/demo-sessions/...`.
3. License must be CC0 / royalty-free. No third-party stems.

## Why no audio is shipped today

This is a manifest-first slot — the code paths exist so adding stems
later is a one-PR job. Until stems land, every demo uses the procedural
beat-machine pattern.

# Studio Production Readiness 50 Design

**Date:** 2026-08-22

**Status:** Approved

**Goal:** Make Epic Music Space a dependable browser-based music-production environment where a creator can record or program a song, edit and mix it, save and reopen it, export it, and hand a fixed version to a Battle.

## Product decision

Epic Music Space will consolidate its fragmented Studio implementations around one canonical project model and one production audio engine. `/studio` is the canonical workstation. Existing advanced DAW modules are reused behind focused interfaces; experimental surfaces may remain as compatibility routes but cannot own separate project truth.

Desktop Chrome, Edge, Safari, and Firefox receive the full workstation. Mobile receives reliable capture, beat sketching, playback, review, and handoff rather than a compressed desktop layout. Existing projects hydrate through versioned optional fields and safe defaults.

## Release sequence

### Batch 1 — Recording and session reliability (items 1–10)

1. Multiple tracks can record independent takes without overwriting existing clips.
2. Each recorded take stores measured input/output/base latency and applies a bounded, user-adjustable alignment offset.
3. Recording setup enumerates inputs and outputs, persists device preference, and survives device changes.
4. Monitoring is opt-in, routed through a dedicated gain node, and warns about echo when headphones are not confirmed.
5. Armed tracks show calibrated peak/RMS input meters with clip hold and reset.
6. Metronome supports volume, subdivision, accent, and one-, two-, or four-bar count-in.
7. Punch recording captures only within a valid selected range and preserves outside material.
8. Loop recording creates immutable take lanes for every pass.
9. Comping selects ranges from takes and produces a reversible comp map without deleting sources.
10. Meaningful project mutations write debounced local recovery immediately and throttled cloud checkpoints when authenticated.

### Batch 2 — Persistence and foundational editing (items 11–20)

11. Crash recovery restores project structure, media references, mixer state, and history.
12. Cloud projects reopen deterministically across supported browsers and devices.
13. Audio uploads are resumable, observable, cancellable, retryable, and deduplicated.
14. Performance budgets cover 32-track, 60-minute sessions and memory pressure.
15. A compatibility matrix certifies supported desktop/mobile behavior and explicit fallbacks.
16. Timeline operations use sample-domain positions internally and render musical/clock rulers.
17. Waveforms use decoded channel peaks with zoom-dependent downsampling and durable cache keys.
18. Trimming never mutates source media.
19. Splitting produces adjacent clips that reference one stable source.
20. Drag/drop moves clips across tracks and obeys the active snap mode.

### Batch 3 — Advanced editing (items 21–30)

21. Copy, cut, duplicate, and paste work for clips, tracks, automation, effects, and sections.
22. Slip editing changes the source offset without changing the timeline range.
23. Crossfades expose editable equal-power overlap curves.
24. Time stretching preserves pitch and records its algorithm/quality metadata.
25. Pitch shifting preserves duration and supports semitone/cent adjustment.
26. Import analysis detects tempo with confidence and never silently changes the project BPM.
27. Transient markers are editable and reusable by slicing and quantization.
28. Audio quantization is non-destructive, strength-adjustable, and reversible.
29. Markers and named song sections drive navigation, looping, duplication, and export range.
30. One unified bounded undo/redo history covers project, mixer, routing, automation, and comp edits.

### Batch 4 — MIDI, Beat Machine, samples, and instruments (items 31–43)

31. The piano roll supports create/select/move/resize/delete and multi-selection.
32. Web MIDI inputs are selectable and record timestamped note/velocity events.
33. Velocity lanes support individual and ramp editing.
34. Notes support channel, probability, pan, timing offset, and duration.
35. Swing and reusable groove templates share the transport clock.
36. Steps support length, subdivision, triplets, flam, ratchet, probability, velocity, and microtiming.
37. Patterns arrange into named song sections and print non-destructively to the Studio.
38. The sample browser indexes instrument, genre, mood, BPM, key, favorites, and recents.
39. Pad sample replacement preserves pattern data and supports preview-before-commit.
40. Samples support trim, fade, tune, reverse, choke, envelope, and normalization.
41. User samples and kits upload durably with ownership and quota enforcement.
42. The instrument rack provides sampler, drum rack, subtractive synth, keys, bass, pads, and orchestral starter voices.
43. Presets are searchable, previewable, versioned, and can be favorited.

### Batch 5 — Mixing, finishing, and certification (items 44–50)

44. Routing supports tracks, groups, buses, pre/post sends, returns, master, and cycle prevention.
45. The native rack includes EQ, compressor, limiter, gate, saturation, reverb, delay, chorus, de-esser, and pitch correction.
46. Automation lanes control volume, pan, sends, effects, bypass, and instrument parameters.
47. Freeze/bounce renders processor-heavy tracks with reversible source state.
48. Finish diagnostics report clipping, loudness, phase, low-end buildup, silence, and headroom.
49. Export supports WAV/MP3/stems, sample rate, bit depth, normalization, metadata, progress, cancellation, and retry.
50. Release certification automates the complete create → record → edit → mix → save → reopen → export → Battle journey.

## Architecture

- `studio/session`: versioned canonical project types, migrations, commands, and history.
- `studio/audio`: browser capability adapter, device registry, recording coordinator, transport clock, monitoring graph, meters, and render graph.
- `studio/media`: IndexedDB blobs, cloud media references, resumable uploads, decoded-buffer cache, and relinking.
- `studio/editing`: sample-domain clip operations, comp maps, markers, transients, quantization, stretching, and pitch.
- `studio/midi`: device input, event timeline, piano roll, patterns, grooves, instruments, and presets.
- `studio/mixer`: graph validation, channels, effects, automation, freezing, diagnostics, and export.
- React workspaces consume commands/selectors and never directly mutate canonical state.

## Data and compatibility

Project schema changes are optional, versioned, and migrated on hydration. Audio sources have stable IDs independent of object URLs. Recorded takes are immutable sources; edits and comps reference them. Autosave excludes transient meters, playback position, open menus, and hover state. Public destinations store a project version and render manifest so later edits cannot change an active release or Battle.

## Error handling

Device, permission, decode, upload, save, render, and routing failures return typed recovery actions. A failed effect bypasses safely. Cloud failures retain local recovery. Conflicts preserve both versions. Long operations report progress and cancellation where cancellation cannot corrupt project state.

## Verification gates

Every batch requires unit tests for state/audio math, integration tests for persistence and APIs, browser tests for supported capabilities, typecheck, lint without new errors, production build, route budgets, and backward-compatibility fixtures. Batch 5 additionally requires the full certified song-to-Battle journey and a 32-track soak test.

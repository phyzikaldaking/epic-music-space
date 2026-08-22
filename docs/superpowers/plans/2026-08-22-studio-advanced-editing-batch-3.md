# Studio Advanced Editing Batch 3 Implementation Plan

**Goal:** Deliver items 21–30 as reversible, sample-domain edit commands in the canonical `/studio` experience.

**Architecture:** Model clipboard content, source-offset edits, crossfades, processing metadata, analysis, transients, quantization, sections, and history as pure immutable commands. Keep seconds fields compatible while frames remain canonical.

## Tasks

1. Add typed multi-domain clipboard commands for clips, tracks, automation, effects, and sections.
2. Add non-destructive frame-domain slip editing.
3. Add editable equal-power crossfade curves.
4. Add pitch-preserving stretch metadata and bounded rate changes.
5. Add duration-preserving pitch shift with semitone and cent precision.
6. Add tempo analysis with confidence and explicit project-BPM adoption.
7. Add editable transient marker detection and slicing inputs.
8. Add strength-adjustable, reversible audio quantization.
9. Add named markers/sections with navigation, looping, duplication, and export ranges.
10. Replace track-only history with one bounded project command history, then run all tests, TypeScript, lint, build, and budgets.

Every behavior starts with a failing Vitest test and lands in an isolated commit. After this batch, continue automatically to items 31–40.

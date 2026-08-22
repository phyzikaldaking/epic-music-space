# Studio Persistence and Editing Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver items 11–20: deterministic recovery/cloud reopen, resilient media upload, performance/browser certification, and sample-domain waveform, trim, split, and drag/drop foundations.

**Architecture:** Extend the canonical optional project schema with stable media descriptors and sample-domain clip positions. Put recovery merge, upload state, waveform reduction, and edit commands in pure modules with injected storage/network clocks, then connect them to `/studio`.

**Tech Stack:** TypeScript, React, IndexedDB, Fetch API, Web Audio API, Vitest, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-08-22-studio-production-readiness-50-design.md`

## Global Constraints

- Older projects hydrate without destructive migration.
- Audio blobs never enter URLs or JSON project history.
- Every clip references a stable source ID.
- Upload retries are idempotent by source hash.
- Timeline math uses integer sample frames internally.
- Every production behavior starts with a failing test.

---

### Task 1: Deterministic recovery manifest

**Files:** Create `studio/recoveryManifest.ts`; modify `studio/recovery.ts`, `studio/types.ts`; test `studioRecoveryManifest.test.ts`.

- [ ] Test canonical manifests, missing-media descriptors, mixer/take restoration, local/cloud comparison, and preserve-both IDs.
- [ ] Confirm expected failures.
- [ ] Implement schema-v4 manifest creation, migration, validation, and deterministic conflict choices.
- [ ] Run recovery and compatibility tests.
- [ ] Commit.

### Task 2: Cross-device project hydration

**Files:** Modify `studio/api.ts`, `studio/types.ts`; test `studioCloudHydration.test.ts`.

- [ ] Test full optional-field overlay, stable source references, missing-media fallback, and serialization round trips.
- [ ] Confirm failures.
- [ ] Implement canonical serialize/hydrate adapters without dropping advanced fields.
- [ ] Run compatibility tests.
- [ ] Commit.

### Task 3: Resumable upload state machine

**Files:** Create `studio/resumableUpload.ts`; modify upload route/client; test `studioResumableUpload.test.ts`.

- [ ] Test hashing/deduplication, chunk progress, retry, cancellation, resume token, and finalization.
- [ ] Confirm failures.
- [ ] Implement injected transport and durable upload checkpoint model.
- [ ] Connect progress and recovery actions to Studio imports.
- [ ] Run upload/API tests and commit.

### Task 4: Session capacity and compatibility certification

**Files:** Create `studio/sessionCapacity.ts`, `studioCompatibilityMatrix.ts`; test corresponding suites.

- [ ] Test 32-track/60-minute budget estimates, decoded-buffer eviction, supported browser capability tiers, and mobile fallbacks.
- [ ] Confirm failures.
- [ ] Implement capacity policy, LRU decisions, and explicit compatibility results.
- [ ] Add a synthetic 32-track fixture and commit.

### Task 5: Sample-domain timeline model

**Files:** Create `studio/sampleTimeline.ts`; modify `studio/types.ts`, `studio/timeline.ts`; test `studioSampleTimeline.test.ts`.

- [ ] Test seconds/frame conversion, non-negative ranges, rate conversion, zoom, and snap rounding.
- [ ] Confirm failures.
- [ ] Implement integer-frame positions with backward-compatible second selectors.
- [ ] Run timeline/compatibility tests and commit.

### Task 6: Zoom-aware waveform cache

**Files:** Modify `studio/audio.ts`, `Wave.tsx`; test `studioWaveform.test.ts`.

- [ ] Test channel-accurate peak envelopes, zoom reduction, cache identity, silence, and long files.
- [ ] Confirm failures.
- [ ] Implement min/max peak buckets and durable cache descriptors.
- [ ] Connect waveform resolution to timeline zoom and commit.

### Task 7: Non-destructive trim and split commands

**Files:** Modify `studio/editing.ts`, `studio/types.ts`, `ElectricStudio.tsx`; test `studioEditing.test.ts`.

- [ ] Test stable source IDs, adjacent split frames, trim bounds, undo payloads, and original-source preservation.
- [ ] Confirm failures.
- [ ] Implement frame-domain commands and route UI actions through them.
- [ ] Run editing/compatibility tests and commit.

### Task 8: Drag/drop and snapping

**Files:** Create `studio/clipDrag.ts`; modify `EditWorkspace.tsx`; test `studioClipDrag.test.ts`.

- [ ] Test cross-track moves, free/grid snapping, negative bounds, locked clips, and pointer offsets.
- [ ] Confirm failures.
- [ ] Implement drag intent and canonical move command.
- [ ] Connect accessible pointer/keyboard interactions and commit.

### Task 9: Batch verification

- [ ] Run all Studio tests and the 32-track soak fixture.
- [ ] Run TypeScript and changed-file lint.
- [ ] Run production build and route budgets.
- [ ] Browser-check recovery, upload progress, waveform zoom, trim, split, and drag/drop.
- [ ] Commit verification evidence.

## Next batch

After Batch 2 passes, execute items 21–30: complete clipboard operations, slip editing, equal-power crossfades, time/pitch processing, tempo/transient analysis, audio quantization, song sections, and unified undo/redo.

# Studio Recording Reliability Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver items 1–10 of the Studio Production Readiness 50 program as one compatible recording and autosave foundation.

**Architecture:** Introduce pure recording/session policies first, then a browser capability adapter and recording coordinator, and finally connect them to the canonical Studio shell. Existing DAW recording, IndexedDB, punch, count-in, and take persistence code is reused through adapters rather than copied.

**Tech Stack:** TypeScript, React, Web Audio API, MediaDevices, MediaRecorder, IndexedDB, Vitest, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-08-22-studio-production-readiness-50-design.md`

## Global Constraints

- Preserve hydration of all existing Studio projects.
- Recordings and takes are immutable media sources.
- Never enable monitoring automatically.
- Do not claim unsupported output-device switching; expose capability and fallback honestly.
- Keep transient meter/transport state out of autosave payloads.
- Every production behavior begins with a failing test.

---

### Task 1: Versioned recording domain

**Files:**
- Create: `apps/web/src/app/studio/try/studio/recording.ts`
- Modify: `apps/web/src/app/studio/try/studio/types.ts`
- Test: `apps/web/src/lib/__tests__/studioRecording.test.ts`

**Interfaces:**
- Produces `RecordingDeviceSelection`, `RecordingLatencyProfile`, `RecordingTake`, `TakeLane`, `CompSegment`, `CompMap`, `createRecordingTake`, `calculateRecordingAlignment`, `createCompMap`, and `validatePunchRange`.

- [ ] Write failing tests for bounded latency alignment, invalid punch ranges, immutable loop takes, and non-overlapping comp segments.
- [ ] Run the focused test and confirm failures are caused by missing recording-domain APIs.
- [ ] Implement the minimal pure types and functions.
- [ ] Run the focused test and existing compatibility tests.
- [ ] Commit the recording domain.

### Task 2: Browser device and latency adapter

**Files:**
- Create: `apps/web/src/app/studio/try/studio/recordingDevices.ts`
- Modify: `apps/web/src/app/studio/try/studio/preflight.ts`
- Test: `apps/web/src/lib/__tests__/studioRecordingDevices.test.ts`

**Interfaces:**
- Consumes recording device/latency types from Task 1.
- Produces `listRecordingDevices`, `resolvePreferredDevice`, `measureLatencyProfile`, `watchDeviceChanges`, and capability flags for input/output selection.

- [ ] Write failing tests using injected media-device/context adapters.
- [ ] Confirm expected failures.
- [ ] Implement enumeration, preference resolution, latency calculation, and device-change cleanup.
- [ ] Run focused and preflight tests.
- [ ] Commit the device adapter.

### Task 3: Monitoring and meter graph

**Files:**
- Create: `apps/web/src/app/studio/try/studio/recordingGraph.ts`
- Modify: `apps/web/src/app/studio/try/studio/preflight.ts`
- Test: `apps/web/src/lib/__tests__/studioRecordingGraph.test.ts`

**Interfaces:**
- Produces `createRecordingGraph`, `calculateMeterFrame`, and `MeterFrame` with peak, RMS, dB values, and clip hold.

- [ ] Write failing meter-math and monitoring-policy tests.
- [ ] Confirm failures.
- [ ] Implement pure meter calculation and an injectable Web Audio graph with monitoring gain defaulting to zero.
- [ ] Run focused tests.
- [ ] Commit the recording graph.

### Task 4: Recording coordinator, punch, loop takes, and comping

**Files:**
- Create: `apps/web/src/app/studio/try/studio/recordingCoordinator.ts`
- Modify: `apps/web/src/app/studio/try/studio/types.ts`
- Test: `apps/web/src/lib/__tests__/studioRecordingCoordinator.test.ts`

**Interfaces:**
- Consumes Tasks 1–3.
- Produces `RecordingCoordinator` with `arm`, `start`, `completePass`, `cancel`, and `dispose`, plus independent per-track sessions.

- [ ] Write failing tests for simultaneous armed tracks, existing-clip preservation, punch boundaries, sequential loop pass IDs, cancellation, and resource cleanup.
- [ ] Confirm expected failures.
- [ ] Implement the coordinator with injected recorder/media-store factories.
- [ ] Run focused tests.
- [ ] Commit the coordinator.

### Task 5: Count-in and transport policy

**Files:**
- Create: `apps/web/src/app/studio/try/studio/recordingTransport.ts`
- Modify: `apps/web/src/app/studio/try/studio/types.ts`
- Test: `apps/web/src/lib/__tests__/studioRecordingTransport.test.ts`

**Interfaces:**
- Produces `RecordingTransportSettings`, `countInDurationSeconds`, `metronomeEventTimes`, and `nextPunchTransition`.

- [ ] Write failing tests for one/two/four bars, subdivisions, downbeat accents, tempo changes, and punch transitions.
- [ ] Confirm expected failures.
- [ ] Implement pure transport scheduling policies using the audio clock.
- [ ] Run focused tests.
- [ ] Commit transport policies.

### Task 6: Meaningful-change autosave scheduler

**Files:**
- Create: `apps/web/src/app/studio/try/studio/autosave.ts`
- Modify: `apps/web/src/app/studio/try/studio/recovery.ts`
- Test: `apps/web/src/lib/__tests__/studioAutosave.test.ts`

**Interfaces:**
- Produces `createAutosaveScheduler`, `projectSaveFingerprint`, and explicit local/cloud save events.

- [ ] Write failing tests for immediate local recovery, throttled cloud checkpoints, transient-state exclusion, offline retry, flush, and disposal.
- [ ] Confirm expected failures.
- [ ] Implement scheduler with injected clock/local/cloud writers.
- [ ] Run focused recovery/autosave tests.
- [ ] Commit autosave policies.

### Task 7: Recording setup and active-session UI

**Files:**
- Modify: `apps/web/src/app/studio/try/studio/components/RecordingPreflight.tsx`
- Modify: `apps/web/src/app/studio/try/studio/components/InputMeter.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/RecordingControls.tsx`
- Modify: `apps/web/src/app/studio/try/StudioTryClient.tsx`
- Test: `apps/web/src/lib/__tests__/studioRecordingPresentation.test.ts`

**Interfaces:**
- Consumes Tasks 1–6 and emits canonical Studio commands.

- [ ] Write failing presentation/state tests for device choice, monitoring opt-in, meter labels, count-in options, punch range, take lanes, comp selection, and save state.
- [ ] Confirm expected failures.
- [ ] Implement accessible controls and connect them without mutating audio state directly in React.
- [ ] Run focused Studio tests.
- [ ] Commit the recording UI.

### Task 8: Batch verification

**Files:**
- Modify: `apps/web/src/lib/__tests__/studioCompatibility.test.ts`
- Modify: `apps/web/src/lib/__tests__/criticalFlows.e2e.test.ts`

- [ ] Add compatibility fixtures for pre-upgrade projects and a complete recording/save/reopen test.
- [ ] Run all Studio unit tests.
- [ ] Run web typecheck and lint.
- [ ] Run the production build and performance budget.
- [ ] Perform browser verification for recording setup using mocked media devices where physical devices are unavailable.
- [ ] Commit Batch 1 verification evidence.

## Next batch

After Batch 1 passes, execute items 11–20 from the approved specification: crash recovery, deterministic cloud reopen, resilient uploads, large-session and browser certification, sample-accurate timeline foundations, real waveforms, non-destructive trim/split, and drag/drop snapping.

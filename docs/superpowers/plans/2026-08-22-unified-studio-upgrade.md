# Unified Studio Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all eight approved Studio upgrades as one compatible release: workspace modes, recording preflight, simplified command bar, contextual panels, templates and onboarding, save recovery, professional editing and mixing, and reviewed publishing/Battle handoffs.

**Architecture:** Keep `ElectricStudio` as the production orchestration boundary and extract deterministic state machines and focused UI surfaces under `studio/`. Extend the current optional project payload rather than replacing it, so Creator and Engineer modes share one session and existing projects hydrate safely.

**Tech Stack:** Next.js 16, React 19, TypeScript, Web Audio and MediaRecorder APIs, Vitest, existing Prisma-backed Studio APIs, existing publishing/Marketplace/room/Versus routes.

**Spec:** `docs/superpowers/specs/2026-08-22-unified-studio-upgrade-design.md`

## Global Constraints

- Deliver all eight priorities in one release while keeping each task independently testable.
- Preserve existing projects, recording, cloud persistence, import, playback, Beat Lab, and export callbacks.
- Creator and Engineer modes must use the same project model without conversion or duplication.
- Existing users default to Engineer Mode; first-time users are offered Creator Mode as the recommendation.
- AI and destructive audio edits remain explicit, previewable, and reversible.
- No public publishing, listing, room, or Battle action occurs without a final review.
- New persisted fields are optional and versioned.
- Analytics must not capture audio, titles, track names, messages, or creative content.

---

### Task 1: Workspace Mode and Context Model

**Files:**
- Create: `apps/web/src/app/studio/try/studio/workspace.ts`
- Modify: `apps/web/src/app/studio/try/studio/types.ts`
- Modify: `apps/web/src/app/studio/try/studio/presentation.ts`
- Test: `apps/web/src/lib/__tests__/studioWorkspace.test.ts`

**Interfaces:**
- Produces: `StudioExperienceMode`, `StudioTask`, `StudioTemplateId`, `StudioWorkspaceState`, `getVisibleStudioPanels(state)`, `createTemplateSession(templateId)`.
- Consumes: existing `StudioMode`, `StudioTrack`, and `StudioSavedSession` types.

- [ ] **Step 1: Write failing workspace tests**

```ts
expect(getVisibleStudioPanels({ experience: "creator", task: "create", trackCount: 0, hasSelection: false })).toEqual(["start"]);
expect(getVisibleStudioPanels({ experience: "engineer", task: "arrange", trackCount: 2, hasSelection: true })).toContain("precision-edit");
expect(createTemplateSession("vocal").tracks.map((track) => track.name)).toEqual(["Lead Vocal", "Vocal Double", "Instrumental"]);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm --workspace apps/web test -- studioWorkspace`
Expected: FAIL because `studio/workspace` does not exist.

- [ ] **Step 3: Add the versioned workspace types and deterministic selectors**

```ts
export type StudioExperienceMode = "creator" | "engineer";
export type StudioTask = "create" | "arrange" | "mix" | "finish";
export type StudioTemplateId = "vocal" | "beat" | "podcast" | "stems" | "mastering" | "empty";
export function getVisibleStudioPanels(state: StudioWorkspaceState): StudioPanelId[] {
  if (state.trackCount === 0) return ["start"];
  const panels: StudioPanelId[] = ["tracks", "timeline"];
  if (state.hasSelection) panels.push("inspector", "region");
  if (state.task === "mix") panels.push("mixer");
  if (state.task === "finish") panels.push("finish");
  if (state.experience === "engineer") panels.push("precision-edit");
  return panels;
}
export function createTemplateSession(id: StudioTemplateId): Pick<StudioSavedSession, "bpm" | "sampleRate" | "tracks"> {
  const presets = TEMPLATE_PRESETS[id];
  return { bpm: presets.bpm, sampleRate: 48_000, tracks: presets.tracks.map(createEmptyTemplateTrack) };
}
```

- [ ] **Step 4: Add optional `schemaVersion`, `experienceMode`, `task`, and `templateId` fields with hydration defaults**

Existing payloads without these fields must hydrate as Engineer Mode with the edit task.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm --workspace apps/web test -- studioWorkspace studioPresentation && npm --workspace apps/web run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/studio/try/studio apps/web/src/lib/__tests__/studioWorkspace.test.ts
git commit -m "feat(studio): add shared workspace mode model"
```

### Task 2: Creator/Engineer Shell and Simplified Command Bar

**Files:**
- Create: `apps/web/src/app/studio/try/studio/components/ProjectMenu.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/StudioModeSwitch.tsx`
- Modify: `apps/web/src/app/studio/try/studio/components/StudioChrome.tsx`
- Modify: `apps/web/src/app/studio/try/ElectricStudio.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/lib/__tests__/studioChrome.test.ts`

**Interfaces:**
- Consumes: `StudioExperienceMode`, `StudioTask`, and workspace selectors from Task 1.
- Produces: `StudioChrome` callbacks for mode, task, metronome, count-in, project menu, site exit, help, and health status.

- [ ] **Step 1: Write failing command-surface tests**

```ts
expect(getStudioCommandIds("creator", "create", false)).toEqual(["new", "import", "record"]);
expect(getStudioCommandIds("engineer", "arrange", true)).toContain("precision-tools");
expect(getProjectMenuItems()).toEqual(["new", "save-as", "restore", "snapshot", "archive", "settings"]);
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm --workspace apps/web test -- studioChrome`
Expected: FAIL because command selectors are absent.

- [ ] **Step 3: Replace the two-row control wall with four stable command zones**

Keep transport, undo/redo, current-task action, save/health, mode switch, help, and exit visible. Move Save As, Restore, Snapshot, Archive, and settings into `ProjectMenu`.

- [ ] **Step 4: Persist the experience preference without mutating project audio state**

Use the existing project field when signed in and `localStorage` key `ems.studio.experience.v1` as a guest fallback.

- [ ] **Step 5: Add laptop and mobile shell rules**

At mobile widths, show capture transport and task navigation; display a clear Engineer Mode desktop recommendation rather than compressing precision controls.

- [ ] **Step 6: Run focused tests, lint, and typecheck**

Run: `npm --workspace apps/web test -- studioChrome studioWorkspace && npm --workspace apps/web run lint -- src/app/studio/try && npm --workspace apps/web run typecheck`
Expected: PASS with no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/studio/try apps/web/src/app/globals.css apps/web/src/lib/__tests__/studioChrome.test.ts
git commit -m "feat(studio): add creator and engineer command shell"
```

### Task 3: Templates, Contextual Panels, and First Session Guide

**Files:**
- Create: `apps/web/src/app/studio/try/studio/components/StudioStart.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/FirstSessionGuide.tsx`
- Modify: `apps/web/src/app/studio/try/studio/components/EditWorkspace.tsx`
- Modify: `apps/web/src/app/studio/try/studio/components/Inspector.tsx`
- Modify: `apps/web/src/app/studio/try/studio/components/RegionPanel.tsx`
- Modify: `apps/web/src/app/studio/try/ElectricStudio.tsx`
- Test: `apps/web/src/lib/__tests__/studioFirstSession.test.ts`

**Interfaces:**
- Consumes: `createTemplateSession`, `getVisibleStudioPanels`.
- Produces: `getFirstSessionStep(context)`, resumable guide state under `ems.studio.first-session.v1`.

- [ ] **Step 1: Write failing guide and visibility tests**

```ts
expect(getFirstSessionStep({ trackCount: 0, preflightComplete: false, cloudSaved: false })).toBe("choose-start");
expect(getFirstSessionStep({ trackCount: 1, editCount: 0, cloudSaved: false })).toBe("make-edit");
expect(getVisibleStudioPanels({ experience: "creator", task: "arrange", trackCount: 1, hasSelection: false })).not.toContain("region");
```

- [ ] **Step 2: Verify red state**

Run: `npm --workspace apps/web test -- studioFirstSession`
Expected: FAIL.

- [ ] **Step 3: Build the start surface with six templates and three direct actions**

Templates configure tracks and settings but contain no fake audio. Choosing Record proceeds to preflight; Import opens the existing file input; Beat opens Beat Lab.

- [ ] **Step 4: Add the resumable non-blocking checklist**

Allow Skip, Resume, and Dismiss. Never trap focus or block Studio controls.

- [ ] **Step 5: Gate Inspector, Region, loop, selection, edit history, routing, and export panels using deterministic context**

Hidden panels remain mounted only when state preservation is required; otherwise their values live in `ElectricStudio`.

- [ ] **Step 6: Run tests and accessibility-focused lint**

Run: `npm --workspace apps/web test -- studioFirstSession studioWorkspace && npm --workspace apps/web run lint -- src/app/studio/try`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/studio/try apps/web/src/lib/__tests__/studioFirstSession.test.ts
git commit -m "feat(studio): add guided templates and contextual workspace"
```

### Task 4: Recording Device Preflight and Safer Transport

**Files:**
- Create: `apps/web/src/app/studio/try/studio/preflight.ts`
- Create: `apps/web/src/app/studio/try/studio/components/RecordingPreflight.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/InputMeter.tsx`
- Modify: `apps/web/src/app/studio/try/ElectricStudio.tsx`
- Modify: `apps/web/src/app/studio/try/studio/components/StudioChrome.tsx`
- Test: `apps/web/src/lib/__tests__/studioPreflight.test.ts`

**Interfaces:**
- Produces: `RecordingPreflightState`, `classifyInputSignal(samples)`, `estimateLatency(context)`, `runRecordingPreflight(options)`.
- Consumes: existing `toggleRecord` path only after state is `ready` or the user explicitly chooses continue-with-warning.

- [ ] **Step 1: Write failing state-machine tests**

```ts
expect(classifyInputSignal(new Float32Array(256))).toEqual({ status: "silent", peakDb: -Infinity });
expect(classifyInputSignal(Float32Array.from([0, 0.99, 0])) .status).toBe("clipping");
expect(nextPreflightState("permission-denied", "retry")).toBe("requesting-permission");
```

- [ ] **Step 2: Verify red state**

Run: `npm --workspace apps/web test -- studioPreflight`
Expected: FAIL.

- [ ] **Step 3: Implement browser support, permission, enumeration, signal, sample-rate, and latency checks**

Stop every temporary `MediaStreamTrack` on cancel, completion, device change, and unmount.

- [ ] **Step 4: Add private test recording and playback**

Discard the test blob by default. Require explicit Keep to import it into the project.

- [ ] **Step 5: Add metronome, count-in, pre-roll, punch range, persistent armed-input meter, and clip latch**

Monitoring remains off by default and includes an echo warning.

- [ ] **Step 6: Run unit, type, and browser-mocked tests**

Run: `npm --workspace apps/web test -- studioPreflight && npm --workspace apps/web run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/studio/try apps/web/src/lib/__tests__/studioPreflight.test.ts
git commit -m "feat(studio): add recording preflight and safe capture"
```

### Task 5: Explicit Save State, Checkpoints, and Recovery

**Files:**
- Create: `apps/web/src/app/studio/try/studio/recovery.ts`
- Create: `apps/web/src/app/studio/try/studio/components/ProjectHealth.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/RecoveryComparison.tsx`
- Modify: `apps/web/src/app/studio/try/studio/api.ts`
- Modify: `apps/web/src/app/studio/try/ElectricStudio.tsx`
- Modify: `apps/web/src/app/studio/try/studio/presentation.ts`
- Test: `apps/web/src/lib/__tests__/studioRecovery.test.ts`

**Interfaces:**
- Produces: `StudioSaveState`, `StudioRecoveryEnvelope`, `saveLocalRecovery`, `loadLocalRecovery`, `compareRecoveryVersions`, `getProjectHealth`.
- Consumes: current serialized `StudioSavedSession` and cloud project endpoints.

- [ ] **Step 1: Write failing recovery tests**

```ts
expect(compareRecoveryVersions(localNewer, cloudOlder).recommended).toBe("local");
expect(getProjectHealth({ missingMedia: 1, saveState: "cloud-saved", clipping: false }).level).toBe("warning");
expect(shouldCreateCloudCheckpoint(previous, next, 60_000)).toBe(true);
```

- [ ] **Step 2: Verify red state**

Run: `npm --workspace apps/web test -- studioRecovery`
Expected: FAIL.

- [ ] **Step 3: Persist versioned local recovery before cloud writes**

Use key `ems.studio.recovery.v3:<projectId>` and never remove it until a verified cloud save or explicit discard.

- [ ] **Step 4: Replace free-form save copy with the six explicit save states and timestamps**

Local draft, saving to cloud, cloud saved, offline local, save failed, and conflict detected must be independently announced to assistive technology.

- [ ] **Step 5: Add recovery comparison, preserve-both conflict action, and guided missing-media relink**

Preserve both versions before resolving a conflict. Relink matching media by stable metadata.

- [ ] **Step 6: Run recovery regression tests and typecheck**

Run: `npm --workspace apps/web test -- studioRecovery studioPresentation && npm --workspace apps/web run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/studio/try apps/web/src/lib/__tests__/studioRecovery.test.ts
git commit -m "feat(studio): make saving and recovery explicit"
```

### Task 6: Professional Non-Destructive Editing

**Files:**
- Create: `apps/web/src/app/studio/try/studio/editing.ts`
- Create: `apps/web/src/app/studio/try/studio/components/ClipHandles.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/TakeLanes.tsx`
- Modify: `apps/web/src/app/studio/try/studio/types.ts`
- Modify: `apps/web/src/app/studio/try/studio/components/EditWorkspace.tsx`
- Modify: `apps/web/src/app/studio/try/studio/components/Inspector.tsx`
- Modify: `apps/web/src/app/studio/try/ElectricStudio.tsx`
- Test: `apps/web/src/lib/__tests__/studioEditing.test.ts`

**Interfaces:**
- Produces: pure operations `trimClip`, `splitClip`, `setClipFade`, `crossfadeClips`, `stretchClip`, `shiftClipPitch`, `normalizeClip`, `createComp`.
- Consumes: versioned `StudioClip` additions for playbackRate, pitchSemitones, sourceId, renderedFromId, takeLaneId, and groupId.

- [ ] **Step 1: Write table-driven failing edit tests**

```ts
expect(trimClip(clip, { left: 1 }).trimStart).toBe(1);
expect(setClipFade(clip, { fadeIn: 99 }).fadeIn).toBeLessThanOrEqual(visibleClipDuration(clip));
expect(crossfadeClips(left, right, 0.5)).toMatchObject({ overlap: 0.5 });
```

- [ ] **Step 2: Verify red state**

Run: `npm --workspace apps/web test -- studioEditing`
Expected: FAIL.

- [ ] **Step 3: Implement pure clamped edit operations and version hydration defaults**

Every operation returns new objects and records a single undo history entry.

- [ ] **Step 4: Add direct trim, fade, crossfade, stretch, pitch, gain, mute, reverse, normalize, folder, and take-lane controls**

Rendered operations preserve `sourceId` and create a new derived source.

- [ ] **Step 5: Add bars/beats and clock ruler modes with consistent labels**

- [ ] **Step 6: Run edit tests and existing Studio presentation tests**

Run: `npm --workspace apps/web test -- studioEditing studioPresentation && npm --workspace apps/web run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/studio/try apps/web/src/lib/__tests__/studioEditing.test.ts
git commit -m "feat(studio): add non-destructive professional editing"
```

### Task 7: Mixer Routing, Effects Browser, and Reversible Assistance

**Files:**
- Create: `apps/web/src/app/studio/try/studio/mixing.ts`
- Create: `apps/web/src/app/studio/try/studio/components/EffectsBrowser.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/RoutingPanel.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/MixAssistant.tsx`
- Modify: `apps/web/src/app/studio/try/studio/types.ts`
- Modify: `apps/web/src/app/studio/try/studio/components/MixerWorkspace.tsx`
- Modify: `apps/web/src/app/studio/try/ElectricStudio.tsx`
- Test: `apps/web/src/lib/__tests__/studioMixing.test.ts`

**Interfaces:**
- Produces: `validateRouting`, `applyMixSuggestion`, `removeMixSuggestion`, `getMeterState`, effect and preset search selectors.
- Consumes: track inserts, sends, outputBusId, groupId, and reversible suggestion patches.

- [ ] **Step 1: Write failing routing and suggestion tests**

```ts
expect(validateRouting(graphWithCycle)).toEqual({ valid: false, reason: "Routing cycle detected" });
expect(removeMixSuggestion(applyMixSuggestion(session, suggestion), suggestion.id)).toEqual(session);
expect(getMeterState({ peakDb: 0.2, rmsDb: -8 }).clipping).toBe(true);
```

- [ ] **Step 2: Verify red state**

Run: `npm --workspace apps/web test -- studioMixing`
Expected: FAIL.

- [ ] **Step 3: Add buses, sends, inserts, bypass, groups, and cycle-safe routing**

- [ ] **Step 4: Build searchable categorized presets with favorites and preview bypass**

- [ ] **Step 5: Add opt-in assistant suggestions as reversible project patches**

No source audio or project field is changed until the user applies a suggestion.

- [ ] **Step 6: Run mixer tests, typecheck, and lint**

Run: `npm --workspace apps/web test -- studioMixing && npm --workspace apps/web run typecheck && npm --workspace apps/web run lint -- src/app/studio/try`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/studio/try apps/web/src/lib/__tests__/studioMixing.test.ts
git commit -m "feat(studio): add routing effects and mix assistance"
```

### Task 8: Finish Validation and Reviewed Destination Handoffs

**Files:**
- Create: `apps/web/src/app/studio/try/studio/finish.ts`
- Create: `apps/web/src/app/studio/try/studio/components/FinishReview.tsx`
- Create: `apps/web/src/app/studio/try/studio/components/BattleHandoff.tsx`
- Modify: `apps/web/src/app/studio/try/studio/components/ExportWorkspace.tsx`
- Modify: `apps/web/src/app/studio/try/ElectricStudio.tsx`
- Modify: `apps/web/src/app/studio/new/page.tsx`
- Modify: `apps/web/src/app/versus/new/VersusNewClient.tsx`
- Modify: `apps/web/src/app/verzuz/new/VerzuzNewClient.tsx`
- Test: `apps/web/src/lib/__tests__/studioFinish.test.ts`

**Interfaces:**
- Produces: `validateStudioFinish`, `buildStudioHandoff`, `StudioHandoffDestination`, `BattleExcerpt`.
- Consumes: current export callback and existing destination routes; handoff state uses signed short-lived server-safe identifiers or session storage, never audio blobs in URLs.

- [ ] **Step 1: Write failing validation and payload tests**

```ts
expect(validateStudioFinish(projectWithMissingMedia).blocking.map((issue) => issue.code)).toContain("missing-media");
expect(validateStudioFinish(clippingProject).warnings.map((issue) => issue.code)).toContain("true-peak");
expect(buildStudioHandoff(project, "battle")).toMatchObject({ destination: "battle", reviewRequired: true });
```

- [ ] **Step 2: Verify red state**

Run: `npm --workspace apps/web test -- studioFinish`
Expected: FAIL.

- [ ] **Step 3: Implement missing-media, save, clipping, silence, tail, loudness, range, format, and metadata checks**

Only unusable-output conditions block. Every overrideable warning explains the consequence.

- [ ] **Step 4: Add reviewed Download, Publish, Marketplace, Room, and Battle destinations**

The final confirm is destination-specific. Failed handoffs preserve the source project and entered review data.

- [ ] **Step 5: Add Battle excerpt, loudness-normalization preview, format, criteria, opponent, schedule, and visibility state**

Snapshot the source version and excerpt so later Studio edits do not mutate an active challenge.

- [ ] **Step 6: Run handoff contract tests and route typecheck**

Run: `npm --workspace apps/web test -- studioFinish && npm --workspace apps/web run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/studio apps/web/src/app/versus apps/web/src/app/verzuz apps/web/src/lib/__tests__/studioFinish.test.ts
git commit -m "feat(studio): add finish review and destination handoffs"
```

### Task 9: Accessibility, Analytics, Compatibility, and Release Verification

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/studio/try/ElectricStudio.tsx`
- Create: `apps/web/src/lib/__tests__/studioCompatibility.test.ts`
- Create: `apps/web/src/lib/__tests__/studioAccessibility.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: rollout-ready integrated Studio and regression gates.

- [ ] **Step 1: Add legacy project fixtures and verify hydration, playback metadata, save payload, and export settings**

```ts
expect(hydrateStudioSession(legacyFixture)).toMatchObject({ experienceMode: "engineer", task: "arrange" });
expect(toStudioProjectPayload(hydrateStudioSession(legacyFixture), false)).toMatchObject({ name: legacyFixture.title });
```

- [ ] **Step 2: Add keyboard, accessible-name, status-text, focus, and reduced-motion assertions**

- [ ] **Step 3: Add privacy-safe events for mode, template, preflight result category, recovery, finish issue category, and destination conversion**

Do not send project IDs, names, audio metadata, filenames, artist names, or free-form text.

- [ ] **Step 4: Run the complete verification matrix**

Run:

```bash
npm --workspace apps/web run lint
npm --workspace apps/web run typecheck
npm --workspace apps/web test
npm --workspace apps/web run build
node scripts/check-route-performance.mjs
git diff --check
```

Expected: all commands exit 0 and Studio routes remain within their documented budgets.

- [ ] **Step 5: Run a real browser walkthrough**

Verify Creator first session, Engineer legacy project, permission denial, silent input, recording, offline recovery, edit undo, routing rejection, export warnings, and each reviewed handoff at desktop and mobile widths.

- [ ] **Step 6: Commit integrated release gates**

```bash
git add apps/web .github/workflows/ci.yml
git commit -m "test(studio): verify unified production upgrade"
```

- [ ] **Step 7: Publish the branch, open a PR, and require clean CI before merge**

Confirm lint, typecheck, unit tests, build, route budgets, critical browser tests, security audit, DevSkim, and Guardian on the exact head SHA. Merge only after those gates pass, then verify the Railway web deployment and public `/studio` response.

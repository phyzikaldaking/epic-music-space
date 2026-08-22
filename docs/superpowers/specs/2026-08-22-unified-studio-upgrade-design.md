# Unified Studio Upgrade Design

**Date:** 2026-08-22

**Status:** Approved in conversation; awaiting written-spec review

**Scope:** One coordinated release covering the eight approved Studio priorities

## Purpose

Turn the live Future Platinum Studio into a welcoming creator workflow and a credible professional production environment without breaking existing projects, recording, cloud persistence, or exports.

The release must deliver all eight approved priorities together:

1. Beginner and expert workspace modes.
2. Recording-device preflight.
3. A simplified command bar.
4. Context-sensitive panels.
5. Templates and a guided first session.
6. Clear, resilient save and recovery behavior.
7. Stronger editing and mixing workflows.
8. Direct publishing and Battle integration.

## Product Principles

- Reveal complexity when it becomes useful.
- Preserve one project model across every workspace mode.
- Make recording readiness and save state unambiguous.
- Keep every AI or destructive edit reversible.
- Review public-facing actions before publishing them.
- Maintain compatibility with current Studio projects and audio callbacks.
- Treat mobile as a focused capture and review experience, not a compressed desktop DAW.

## Experience Architecture

### Creator Mode

Creator Mode is the default for new and returning non-expert users. It emphasizes five tasks: start, record or import, arrange, mix, and finish. It hides precision controls until the current task needs them.

The primary navigation is:

- Create
- Arrange
- Mix
- Finish

Creator Mode uses musician-facing language, large targets, contextual help, and guided next actions. It does not remove capability from the project; it presents a smaller control surface over the same underlying session.

### Engineer Mode

Engineer Mode exposes the complete production environment: precision tools, edit modes, routing, buses, sends, detailed meters, automation, sample-rate controls, and advanced export settings.

Switching modes never converts, duplicates, or discards project data. The current playhead, selection, armed track, transport state, and unsaved edits remain intact.

### Mode Selection

First-time users choose between Creator and Engineer Mode after a short explanation. Creator Mode is recommended. The preference is stored per user and can be changed from the command bar or Studio settings.

Existing users initially retain Engineer Mode so the release does not unexpectedly remove controls from established workflows.

## Simplified Command Bar

The command bar is divided into four stable zones:

1. Studio identity, project title, workspace mode, and exit-to-site control.
2. Transport: return, stop, play or pause, record, metronome, and count-in.
3. Current-task actions, such as Import in an empty session or Split with a selected clip.
4. Save state, project health, help, shortcuts, and the project menu.

New, Save As, Restore, Snapshot, Archive, and project settings move into the Project menu. Undo and redo remain directly accessible. Secondary controls may be reached through contextual toolbars and keyboard shortcuts.

The command bar must remain usable at laptop widths without horizontal scrolling. Mobile uses a compact capture transport and bottom task navigation.

## Context-Sensitive Workspace

Panels render only when they are actionable:

- The empty session shows templates and Record, Import, and Start Beat actions.
- Clip editing appears after a clip is selected.
- Selection and loop controls appear after a region or loop is created.
- Track controls appear after a track exists.
- Routing, effects, and sends appear in Mix or Engineer Mode.
- Export validation appears in Finish.
- The edit log is available through project history rather than occupying the empty timeline.

Hidden panels retain their state. Context changes must not reset values.

## Templates and Guided First Session

### Templates

The initial release includes:

- Vocal Recording
- Beat Making
- Podcast
- Mix Stems
- Mastering
- Empty Session

Templates configure useful defaults such as track names, track types, routing, metronome, sample rate, effects placeholders, and export target. Templates never add fake audio.

### First-Session Guide

The guide is a resumable checklist rather than a blocking tour:

1. Choose a template or empty session.
2. Complete device preflight when recording is selected.
3. Record or import audio.
4. Make one safe edit.
5. Set a basic balance.
6. Confirm cloud save.
7. Run the finish check.
8. Export, publish, license, open a room, or create a Battle.

Users can skip, resume, or permanently dismiss the guide. Completion is stored per user. Contextual help remains available afterward.

## Recording Preflight

Preflight runs before the first recording in a browser session and whenever the input device changes. It checks:

- Browser audio support.
- Microphone permission.
- Available input devices.
- Selected input and channel configuration.
- Incoming signal.
- Clipping risk.
- Requested and actual sample rate.
- Estimated input and output latency.
- Monitoring compatibility.

The user records and plays back a short private test. The test is discarded unless the user explicitly keeps it. The interface explains direct monitoring and echo risk without enabling monitoring automatically.

The recording transport includes metronome, count-in, pre-roll, punch-in, and punch-out. A persistent input meter and clip indicator remain visible while a track is armed.

Permission denial, missing devices, silence, clipping, and unsupported configurations each receive a specific recovery action. Recording is never represented as ready until the selected input produces a valid signal or the user explicitly continues without a detected signal.

## Save, Autosave, and Recovery

### Save States

The command bar uses these explicit states:

- Local draft
- Saving to cloud
- Cloud saved
- Offline; saved locally
- Save failed
- Conflict detected

Each state reveals its meaning and most recent timestamp. Guest users are told that their draft is local and are shown how signing in preserves it in the cloud.

### Checkpoints

Autosave records local recovery state frequently and creates throttled cloud checkpoints after meaningful project changes. Checkpoints are structural versions, not transport or meter snapshots.

Manual snapshots are named versions. The history view shows timestamp, author, source, and a concise change summary.

### Recovery

After a crash, interrupted upload, tab conflict, or stale cloud write, Studio presents a comparison between the newest local recovery and the latest cloud version. The user can:

- Open the recovered version.
- Open the cloud version.
- Preserve both as named versions.

Missing media opens a relink workflow with filename, duration, size, and waveform hints. Relinking one file can resolve other missing references to the same source.

## Editing Workflow

The release makes the following clip operations direct and discoverable:

- Trim and slip editing.
- Split and join where compatible.
- Duplicate, move, and snap.
- Fade in, fade out, and crossfade handles.
- Gain and mute per clip.
- Time stretching with duration feedback.
- Pitch shifting with semitone and cent controls.
- Non-destructive reverse and normalization.

Every edit is represented in undo and redo history. Destructive rendering creates a new source and preserves the original. The timeline uses consistent musical bars and beats or clock time based on the selected ruler mode.

Track folders and groups organize large sessions. Take lanes support recording multiple passes and creating comps without overwriting takes.

## Mixing Workflow

The mixer provides:

- Input gain and peak or RMS metering.
- Pan, mute, solo, arm, and fader controls.
- Inserts with bypass and before or after comparison.
- Sends to buses with pre or post-fader selection.
- Track groups, buses, and master routing.
- Clear clipping and headroom indicators.
- Searchable effects and preset browser.
- Preset favorites and live auditioning.

Routing changes use a validation layer that prevents cycles and reports missing destinations. Creator Mode presents simplified channel controls and curated effect chains; Engineer Mode exposes the full routing model.

AI assistance analyzes the session only after user initiation. It returns explanations and reversible suggestions for cleanup, balance, EQ, dynamics, vocal treatment, and mastering. Suggestions can be previewed, applied individually, bypassed, or removed. AI never silently overwrites source audio or project state.

## Finish, Publishing, and Battle Handoff

### Finish Check

Before export or publication, Studio checks:

- Missing or offline media.
- Unsaved project changes.
- Clipping and true-peak risk.
- Excessive silence or truncated tails.
- Loudness relative to the selected target.
- Export range.
- File format, sample rate, and bit depth.
- Required title, artwork, ownership, and licensing metadata.

Warnings explain consequences and allow safe overrides. Blocking errors are limited to states that would create a missing or unusable output.

### Destinations

From the review screen, users can:

- Download an export.
- Publish a release.
- Create a Marketplace listing and license.
- Start a listening room.
- Create a 1v1, Royale, or multi-round Battle challenge.

No destination becomes public without a final review and confirmation.

### Battle Preparation

The Battle handoff lets the artist choose an exact excerpt, preview the opposing presentation, and confirm loudness normalization. The selected excerpt and source version are stored with the challenge so later Studio edits cannot silently change an active Battle.

Artists can choose the battle format, judging criteria, opponent, schedule, and visibility without leaving Studio. The final review shows both sides when available and clearly distinguishes an invitation from a live public event.

## Shared Project Model

All surfaces consume the existing Studio project as the single source of truth. Additions such as workspace preference, templates, buses, sends, takes, checkpoints, export targets, and Battle excerpts must be introduced through versioned optional fields and migration helpers.

Older projects hydrate with safe defaults. New projects remain readable by recovery tools even if an optional advanced feature cannot load. Audio source identifiers remain stable across modes, checkpoints, and handoffs.

## Error Handling

- Device errors name the affected device and provide a recovery action.
- Audio decode failures identify the file and preserve other successful imports.
- Cloud failures retain a local recovery copy and expose retry.
- Conflicts preserve both versions before asking the user to choose.
- Effect or AI failures bypass the failed process without muting the project.
- Export failures retain render settings and allow retry.
- Publishing and Battle failures do not delete or mutate the finished Studio project.

All long-running operations show progress, cancellation where safe, and a final success or failure state.

## Accessibility and Responsive Behavior

- All controls have accessible names, visible focus, and keyboard operation.
- Tooltips explain icons and expert terminology.
- Status is conveyed through text and icons, not color alone.
- Meters provide non-visual clipping and signal status.
- Reduced-motion preferences disable decorative and meter interpolation effects where appropriate.
- Creator Mode targets meet touch sizing requirements.
- Mobile supports capture, playback, basic trimming, comments, save status, and handoff review.
- Engineer Mode may require a tablet or desktop and must say so clearly instead of rendering an unusable compressed interface.

## Observability and Analytics

Measure:

- Template selection and first-session completion.
- Preflight success and failure reasons.
- Time to first recording or import.
- Save failure, conflict, and recovery rates.
- Editing and mixing feature adoption by mode.
- Export readiness failures.
- Export, publication, Marketplace, room, and Battle conversion.
- Mode switching and permanent guide dismissal.

Do not capture audio, project titles, track names, messages, or other creative content in analytics.

## Verification Strategy

### Unit and Contract Tests

- Mode preference and shared project-state invariants.
- Contextual panel visibility rules.
- Template creation and migration.
- Device-preflight state machine.
- Save-state transitions, checkpoint throttling, conflict preservation, and recovery comparison.
- Editing operations and undo or redo history.
- Routing-cycle prevention.
- Finish validation.
- Publishing and Battle payload contracts.

### Integration Tests

- Creator and Engineer modes opening the same project without state loss.
- Record, stop, playback, save, reload, and recover.
- Importing a mixed set of valid and invalid audio files.
- Offline edits followed by cloud reconciliation.
- Applying and removing effects and AI suggestions.
- Exporting and completing each handoff destination.

### Browser and Device Tests

- Chromium, Safari, and Firefox recording support boundaries.
- Microphone permission denied, revoked, and device removed.
- Laptop, tablet, and mobile responsive behavior.
- Keyboard-only workflow and screen-reader status announcements.
- Reduced-motion behavior.

### Release Safety

- Existing Studio project fixtures must hydrate and export successfully.
- Existing recording, import, cloud-save, and export callbacks receive regression coverage.
- New schema fields are optional and versioned.
- The release remains behind a controlled rollout flag until production recovery, save, and export telemetry meet the acceptance thresholds.

## Acceptance Criteria

The unified release is ready when:

1. A first-time user can create, record or import, save, and export a session through Creator Mode without encountering unexplained expert controls.
2. An established user can open the same project in Engineer Mode with current production capabilities intact.
3. Device preflight accurately distinguishes ready, silent, clipping, denied, missing, and unsupported states.
4. Local and cloud save states are explicit, and crash or conflict recovery preserves every viable version.
5. The approved editing and mixing operations are non-destructive and undoable.
6. Finish validation catches missing media, clipping, loudness, range, format, and metadata problems.
7. Publishing, Marketplace, room, and Battle handoffs require review and never corrupt the source project on failure.
8. Existing project fixtures, production build, performance budgets, accessibility checks, and critical browser tests pass.

## Out of Scope

- Hosting third-party native VST or Audio Unit binaries in the browser.
- Replacing the current cloud storage provider.
- Rebuilding the Battle Arena itself; this release implements the Studio-to-Battle handoff.
- Full mobile multitrack mixing and routing parity with desktop Engineer Mode.
- Automatically publishing or challenging another artist without final user review.

# Release Notes

## 2026-05-07 - Studio Reliability, Onboarding, and Guest Publish Resume

### Summary

This release improves DAW recording reliability, speeds up first paint in Studio, upgrades mobile recording ergonomics, and adds a full guest-to-signup publish resume flow.

### Highlights

- DAW reliability hardening:
  - Added recording lifecycle guards to prevent overlapping async start/stop transitions.
  - Improved punch-in stability during recording state changes.
  - Added safer capability checks for browser media recording startup.
- Studio UX and performance:
  - Deferred heavy Studio UI panels for faster initial paint.
  - Added sticky mobile recording controls for faster touch operation.
  - Added one-click Instant Record setup for ready-to-capture sessions.
- Guest conversion and publish continuity:
  - Guests can create in Studio Try, start publish, and preserve their rendered mix.
  - Mix is stashed locally and restored after signup.
  - Studio New resumes upload and pre-fills publish flow without requiring a re-render.
  - Added first-session coach prompt to guide first interaction in Studio Try.

### Files Added

- apps/web/src/app/studio/new/GuestResumePublish.tsx
- apps/web/src/app/studio/try/FirstBeatCoach.tsx
- apps/web/src/lib/guestStash.ts

### Files Updated

- apps/web/src/components/daw/DawWorkspace.tsx
- apps/web/src/components/daw/dawEngine.ts
- apps/web/src/app/studio/try/page.tsx
- apps/web/src/app/studio/new/page.tsx

### Validation

- Lint passed (apps/web)
- TypeScript passed (apps/web)
- Focused Vitest suites passed (27 tests)

### Commit

- 8388eb1 - Improve studio reliability, onboarding, and guest publish resume

# Studio observability

Studio telemetry is intentionally metadata-only. It never captures raw audio, waveform samples, file contents, or audio URLs.

## Release context

The client attaches `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` or `NEXT_PUBLIC_RELEASE` to every Studio event as `release`. Railway deployments should set `NEXT_PUBLIC_RELEASE` to the deployed commit SHA when the platform does not provide the Vercel variable.

## Core funnel

Create a PostHog funnel using:

1. `studio_opened`
2. `sample_library_loaded`
3. `sample_preview_started`
4. `sample_assigned`
5. `timeline_clip_placed`
6. `timeline_clip_played`
7. `project_saved`

Break down by `release`, `mode`, browser, and device class. Alert when any failure event exceeds 5% of the matching start event over 15 minutes.

## Failure views

Create trends for:

- `audio_context_failed`
- `sample_library_failed`
- `sample_preview_failed`
- `timeline_clip_failed`
- `audio_import_failed`
- `beat_export_failed`
- `project_save_failed`

Use `error_name`, `error_message`, and the first five stack frames for grouping. Do not use raw audio names, URLs, or file contents as event properties.

## Beta feature flags

Use PostHog flags to gate unfinished Studio work:

- `studio-print-to-studio-v2`
- `studio-real-sample-rendering`
- `studio-session-recording`
- `studio-new-mixer-routing`

The client helper defaults flags to disabled when PostHog is unavailable.

## Privacy

Analytics is opt-in through the existing cookie consent banner. Session replay is disabled by default. Only an explicit approved consent path may call the Studio replay opt-in helper. Raw audio and file contents must never be sent to PostHog.

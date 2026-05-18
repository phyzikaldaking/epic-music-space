# Studio persistence push

This commit records the Studio persistence work queue and the current backend handoff points.

## Implemented / present

- Database-backed StudioProject and StudioTrack models are present in Prisma.
- Production migration adds StudioAudioFile, StudioClip, StudioProjectCollaborator, StudioProjectLock, and StudioExportJob tables.
- `/api/studio/projects` supports create/list with project metadata and tracks.
- `/api/studio/projects/[id]/production` supports production project load/save metadata.
- `/api/studio/projects/[id]/audio/upload` stores imported audio in Vercel Blob and records StudioAudioFile plus optional StudioClip.
- Upload route accepts waveform peaks as `peaksJson` and stores them with audio/clip records.
- Export processing routes are present for queued export manifests and fail clearly when the real WAV/MP3 renderer is not configured.

## Remaining integration checkpoints

- Finish wiring `ElectricStudio.tsx` save/autosave away from browser-only session storage and into the Studio project API.
- Hydrate saved tracks/clips/audio files from the production route, including durable source URLs.
- Persist clip edits on save: start, trim, duration, gain, mute, and lock.
- Replace raw grid seconds with BPM subdivisions in the timeline UI.
- Expand undo/redo snapshots beyond track-only state.
- Polish browser WAV export and connect MP3 export to the queued worker path.
- Add a QA path that confirms `Project restored successfully` after a cloud restore.

## Notes

The backend path is now the source of truth for Studio project persistence. Browser localStorage should only remain as a temporary compatibility fallback for tab locks or migration recovery, not as the primary save/autosave store.

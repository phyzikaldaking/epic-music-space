# EMS Production Hardening Checklist

## Automated smoke tests
- Homepage loads without hydration/runtime errors.
- Studio route loads and side navigation switches Studio/Edit/Mix/Beat/Collab/Export.
- Spacebar toggles transport outside text inputs.
- Beat pads trigger without overlapping UI lockups.
- Add Drum/Bass/Melody/Vocal Track buttons create visible tracks.
- Collab console loads and handles LiveKit missing/configured states.
- Snapshot API accepts autosave payloads and returns latest snapshot.
- Realtime API accepts operations and reports revision/conflict state.
- Export API queues full mix, stems, preview, and license package requests.
- Status page and `/api/system/status` return healthy/degraded/down state.

## Accessibility audit
- Keyboard-only navigation through studio rail, transport, mixer, beat pads, export, and collab links.
- Focus visible on all interactive controls.
- Button labels present for icon-like controls.
- Color contrast checked in neon/cyan/pink/yellow areas.
- Reduced-motion audit for animated glow/pulse elements.
- Screen-reader pass for transport, tracks, mixer controls, and recovery status.
- Modals and overlays require focus trapping before release.

## Browser/device matrix
- Chrome desktop: macOS, Windows.
- Safari desktop: macOS.
- Edge desktop: Windows.
- Chrome Android: phone + tablet.
- Safari iOS: iPhone + iPad.
- iPad touch interaction: mixer faders, beat pads, scrolling panels.
- Audio permission recovery: mic/camera denied, then re-enabled.
- LiveKit reconnection: refresh, disconnect, network drop.

## Remaining engineering gates
- Add Playwright suite for the smoke tests above.
- Add axe accessibility automation.
- Add real offline renderer worker for stems/full mix.
- Persist moderation signals to DB-backed review queue.
- Replace demo recommendations with marketplace analytics feed.

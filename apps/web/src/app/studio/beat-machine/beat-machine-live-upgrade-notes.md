# Beat Machine Live Upgrade Notes

This branch starts the studio beat-machine upgrade away from fixed demo mode.

Implemented target behavior for the next code pass:

- Spacebar should toggle transport while ignoring typing fields.
- Numeric and QWER keys should trigger pads.
- Pattern length should support more than the fixed 16-step grid.
- Exports and Print To Studio should include step-count metadata.
- Supabase-backed sounds should replace hardcoded demo sound labels when the project audio endpoint is wired.

Acceptance checks:

- Press Space on the beat-machine page to start/stop playback.
- Switch between 8, 16, 32, and 64 steps without losing existing notes.
- Confirm stem metadata includes pattern length.
- Confirm sound assignment uses real asset URLs once the Supabase sound endpoint is connected.

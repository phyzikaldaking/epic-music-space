# Content Ownership Runbook

## Upload review

When a track is disputed:

1. Preserve the song row, upload URL, uploader ID, and timestamps.
2. Check connected accounts, profile identity, prior uploads, and license sales.
3. Move the track out of sale surfaces if ownership is unclear.
4. Ask uploader for proof of rights: session files, distributor screenshots, split sheet, registration, or contract.
5. Resolve through DMCA flow if a legal notice exists.

## Product gap

The next hardening step is an `OwnershipClaim` model tied to `Song`, `User`, and `UserReport`, plus audio fingerprinting before marketplace listing.

Minimum fields:

- `songId`
- `claimantUserId`
- `status`
- `proofUrls`
- `reviewedById`
- `reviewedAt`

## Emergency takedown

1. Set the song inactive.
2. Pause payouts attached to the disputed song.
3. Notify license holders if purchased rights may be affected.
4. Record an admin audit action and public status incident only if buyers are impacted.

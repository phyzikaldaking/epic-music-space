# Stream / audio playback broken

## Signals
- Users report "tracks won't play"
- 502 / 5xx from `/api/songs/[id]/stream`
- 422 with `embed_only` for tracks that should stream natively
- `STREAM_FRAUD_ALERT` notifications spiking on real fans

## Triage
1. Pick a known-good track id and curl the proxy:
   ```bash
   curl -I -H "Origin: https://epicmusicspace.com" \
     "https://epicmusicspace.com/api/songs/<id>/stream"
   ```
   - 403 → Origin/Referer check is too strict (recent matcher change?).
   - 502 → upstream (Supabase / S3) returning errors.
   - 422 → `classifyAudioSource` flagged the URL as embed-only.
   - 429 → rate limiter is too aggressive.
2. Check Supabase storage status if upstream is on Supabase.
3. Look at `Song.isActive` — soft-deleted tracks correctly return 404.

## Recovery — origin/referer false positives
The proxy whitelists the canonical site, www-stripped form, the request's
Host, and `epic-music-space*.vercel.app` previews. If a new domain is in
play, add it to `getSiteUrl()` or update `VERCEL_PREVIEW_RE` and ship.

## Recovery — stream fraud false-positive
Per-IP burst counters trip at 15 plays/minute or 120/day on the same song.
Genuine super-fans behind a corporate NAT can hit this. To unblock a
specific user/IP without disabling the protection:
```sql
-- Remove their risk events for the day so payout calc doesn't penalize them
DELETE FROM "RiskEvent"
WHERE "eventType" = 'fake_play'
AND "createdAt" > now() - interval '24 hours'
AND "ip" LIKE '<prefix>%';
```
Consider raising the threshold in `apps/web/src/app/api/songs/[id]/stream/route.ts`
if this is a recurring false positive.

## Recovery — Mux / external embed failing
The route returns 422 with `embed_only` when the URL isn't streamable bytes
(YouTube, SoundCloud, Spotify, Vimeo). Client renders an iframe instead.
If client is showing "preview unavailable" for tracks that have a Mux URL,
verify Mux playback id is non-null and `MUX_TOKEN_ID` env is set.

## What NOT to do
- Do not log the upstream `audioUrl` in error responses. The whole point of
  the proxy is hiding the upstream URL.
- Do not relax `Cross-Origin-Resource-Policy: same-origin` on stream
  responses — that's the only thing keeping a leaked URL from being embedded
  on a piracy site.
- Do not increase the proxy's cache TTL beyond the current `s-maxage=3600`
  without considering license revocation latency on refunds.

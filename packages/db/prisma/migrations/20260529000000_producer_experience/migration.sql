-- Producer-experience expansion. Adds:
--   * Song.viewCount         track-page views, distinct from /stream hits.
--                            enables the funnel views -> streams -> licenses.
--   * Song.isDraft           keeps a song out of every public surface
--                            (marketplace, trending, profile, search).
--   * Song.scheduledAt       cron flips isDraft -> false at this time.
--   * Song.licenseVariants   JSON array of tier descriptors for tiered licensing
--                            (basic/premium/exclusive). The legacy licensePrice
--                            stays the BASIC price for backwards compatibility.
--   * Auction.instantBuyPrice         optional "buy it now" cap.
--   * Auction.antiSnipeWindowMinutes  configurable anti-snipe window.
--   * Auction.antiSnipeExtensionMinutes how long to extend on a snipe bid.
--   * Auction.endingSoonNotifiedAt    set by the ending-soon cron so we don't
--                                     re-notify if anti-snipe pushes endsAt out.
--
-- All columns are nullable or defaulted, so this is safe to deploy with
-- zero downtime against the live table.

ALTER TABLE "Song"
  ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "licenseVariants" JSONB;

CREATE INDEX IF NOT EXISTS "Song_isDraft_idx" ON "Song"("isDraft");
CREATE INDEX IF NOT EXISTS "Song_scheduledAt_idx" ON "Song"("scheduledAt");

ALTER TABLE "Auction"
  ADD COLUMN "instantBuyPrice" DECIMAL(10,2),
  ADD COLUMN "antiSnipeWindowMinutes" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "antiSnipeExtensionMinutes" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "endingSoonNotifiedAt" TIMESTAMP(3);

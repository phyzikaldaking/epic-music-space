-- Legacy / vault metadata. Both fields default-safe so old rows are
-- automatically NOT legacy. Lock-friendly + idempotent.
SET lock_timeout = '5s';

ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "isLegacy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "originalReleaseYear" INTEGER;

-- Helps the studio page split current catalog from legacy in one query.
CREATE INDEX IF NOT EXISTS "Song_artistId_isLegacy_idx" ON "Song"("artistId", "isLegacy");

-- Add allow-free-download flag to Song. Defaults to false so existing tracks
-- become preview-only — artists must explicitly opt-in to permit download.
--
-- Lock-friendly: short lock_timeout fails fast if another transaction is
-- holding an ACCESS EXCLUSIVE on Song, instead of stalling the deploy until
-- Postgres' default statement_timeout kills the build.
-- IF NOT EXISTS is used so re-applying after a partial recovery is safe.
SET lock_timeout = '5s';
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "allowFreeDownload" BOOLEAN NOT NULL DEFAULT false;

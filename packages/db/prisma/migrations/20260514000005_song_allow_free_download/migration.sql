-- Add allow-free-download flag to Song. Defaults to false so existing tracks
-- become preview-only — artists must explicitly opt-in to permit download.
ALTER TABLE "Song" ADD COLUMN "allowFreeDownload" BOOLEAN NOT NULL DEFAULT false;

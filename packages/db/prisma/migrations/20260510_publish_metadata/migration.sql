-- Publishing + distribution metadata (#F35, #F36).
-- isrcCode for streaming-service distribution; splitsSheet for
-- multi-contributor royalty agreements.

ALTER TABLE "Song" ADD COLUMN "isrcCode" VARCHAR(15);
ALTER TABLE "Song" ADD COLUMN "splitsSheet" JSONB;

-- Spot-index on ISRC so the future distribution worker can dedupe
-- against tracks already pushed to providers.
CREATE INDEX "Song_isrcCode_idx" ON "Song"("isrcCode");

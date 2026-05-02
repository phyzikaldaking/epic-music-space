-- Add missing indexes on foreign key columns for faster portfolio and match lookups

CREATE INDEX IF NOT EXISTS "LicenseToken_holderId_idx" ON "LicenseToken"("holderId");
CREATE INDEX IF NOT EXISTS "VersusMatch_songAId_idx" ON "VersusMatch"("songAId");
CREATE INDEX IF NOT EXISTS "VersusMatch_songBId_idx" ON "VersusMatch"("songBId");

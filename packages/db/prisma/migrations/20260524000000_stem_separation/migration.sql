-- Stem separation: track AI separation jobs on Song. We already have
-- stemFiles Json? + hasStems Boolean for storing the resolved URLs;
-- this migration adds the lifecycle fields so /api/songs/[id]/stems
-- can show status while a Replicate (Demucs) job is in flight.
--
-- States:
--   NONE       — never requested
--   QUEUED     — request received, provider not yet called
--   PROCESSING — provider job started (id stored in providerId)
--   READY      — stemFiles populated; UI can offer "Open in Studio"
--   FAILED     — provider failed; error stored

CREATE TYPE "StemSeparationStatus" AS ENUM ('NONE', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "Song"
  ADD COLUMN "stemSeparationStatus" "StemSeparationStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "stemSeparationProviderId" TEXT,
  ADD COLUMN "stemSeparationError" TEXT,
  ADD COLUMN "stemSeparationStartedAt" TIMESTAMP(3),
  ADD COLUMN "stemSeparationCompletedAt" TIMESTAMP(3);

-- Backfill: existing songs with hasStems=true (uploaded their own stems)
-- start in READY state so the UI surfaces "Open in Studio" for them too.
UPDATE "Song" SET "stemSeparationStatus" = 'READY' WHERE "hasStems" = TRUE;

-- Index lets the worker / status checks scan PROCESSING jobs cheaply.
CREATE INDEX "Song_stemSeparationStatus_idx" ON "Song"("stemSeparationStatus");

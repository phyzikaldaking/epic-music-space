-- StemUsage: when an artist drags a stem from the EMS Loop Browser into
-- their DAW track, we record it here. This is the foundation of the
-- marketplace flywheel:
--   - producer A publishes track X → stems generated
--   - producer B drags X.drums into their new track Y
--   - we record (sourceSongId=X, kind=DRUMS, derivedSongId=Y, producerId=B)
--   - when Y sells licenses or earns stream revenue, the royalty
--     waterfall pays producer A their stake (RoyaltyShare table)

CREATE TYPE "StemKind" AS ENUM ('VOCALS', 'DRUMS', 'BASS', 'OTHER', 'FULL');

CREATE TABLE "StemUsage" (
    "id" TEXT NOT NULL,
    "sourceSongId" TEXT NOT NULL,
    "kind" "StemKind" NOT NULL,
    -- nullable while the derived track is still being composed in the DAW
    -- (a drag-into-track event is recorded immediately, the derived song
    -- id is filled in when the producer publishes via /studio/new).
    "derivedSongId" TEXT,
    "producerId" TEXT NOT NULL,
    -- The royalty share owed back to the source artist for this usage.
    -- Default 0.02 (2%) per stem, capped at 10% of derived song revenue
    -- across all stems used (enforced in the royalty waterfall job).
    "shareBps" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StemUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StemUsage_sourceSongId_idx" ON "StemUsage"("sourceSongId");
CREATE INDEX "StemUsage_derivedSongId_idx" ON "StemUsage"("derivedSongId");
CREATE INDEX "StemUsage_producerId_idx" ON "StemUsage"("producerId");

ALTER TABLE "StemUsage"
  ADD CONSTRAINT "StemUsage_sourceSongId_fkey"
    FOREIGN KEY ("sourceSongId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StemUsage_derivedSongId_fkey"
    FOREIGN KEY ("derivedSongId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StemUsage_producerId_fkey"
    FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

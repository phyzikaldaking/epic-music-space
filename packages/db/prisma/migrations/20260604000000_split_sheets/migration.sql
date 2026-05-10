-- Split sheets — per-song royalty agreements.
--
-- Generated automatically when an artist publishes a track from the
-- studio: every collaborator who was present in the live session gets
-- an entry seeded with an equal share. The artist can override before
-- moving the sheet from DRAFT to SIGNED. Once SIGNED, RevenueSplit rows
-- on each payout are allocated according to the entries here.
--
-- shareBps is in basis points (10000 = 100%) so we never have to deal
-- with floating-point precision when summing splits at payout time.

DO $$ BEGIN
  CREATE TYPE "SplitSheetStatus" AS ENUM ('DRAFT', 'SIGNED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SplitSheetRole" AS ENUM ('ARTIST', 'WRITER', 'PRODUCER', 'ENGINEER', 'FEATURE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "SplitSheet" (
  "id"                   TEXT PRIMARY KEY,
  "songId"               TEXT NOT NULL UNIQUE,
  "status"               "SplitSheetStatus" NOT NULL DEFAULT 'DRAFT',
  "createdFromSessionId" TEXT,
  "signedAt"             TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SplitSheet_songId_fkey" FOREIGN KEY ("songId")
    REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SplitSheet_status_idx" ON "SplitSheet"("status");

CREATE TABLE IF NOT EXISTS "SplitSheetEntry" (
  "id"            TEXT PRIMARY KEY,
  "sheetId"       TEXT NOT NULL,
  "userId"        TEXT,
  "displayName"   TEXT NOT NULL,
  "role"          "SplitSheetRole" NOT NULL DEFAULT 'WRITER',
  "shareBps"      INTEGER NOT NULL,
  "inviteEmail"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SplitSheetEntry_sheetId_fkey" FOREIGN KEY ("sheetId")
    REFERENCES "SplitSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SplitSheetEntry_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SplitSheetEntry_sheetId_idx" ON "SplitSheetEntry"("sheetId");
CREATE INDEX IF NOT EXISTS "SplitSheetEntry_userId_idx" ON "SplitSheetEntry"("userId");

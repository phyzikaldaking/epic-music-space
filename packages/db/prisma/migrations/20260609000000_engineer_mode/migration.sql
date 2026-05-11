-- Engineer Mode: verified pro audio engineers list 1-hour mix/master
-- sessions for sale. Reuses the existing VerseListing + SessionBooking
-- pipeline (escrow, dual sign-off, live Room) — the only new pieces
-- are two enum values and the EngineerProfile metadata row.

-- Extend VerseListingKind enum.
ALTER TYPE "VerseListingKind" ADD VALUE IF NOT EXISTS 'ENGINEER_MIX';
ALTER TYPE "VerseListingKind" ADD VALUE IF NOT EXISTS 'ENGINEER_MASTER';

-- EngineerProfile table.
CREATE TABLE "EngineerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tagline" VARCHAR(160),
    "bio" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gearChain" TEXT,
    "maxSampleRate" INTEGER NOT NULL DEFAULT 48000,
    "lufsTargets" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "turnaroundHours" INTEGER NOT NULL DEFAULT 48,
    "sampleWorkUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT,
    "isAcceptingWork" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EngineerProfile_userId_key" ON "EngineerProfile"("userId");
CREATE INDEX "EngineerProfile_verifiedAt_isAcceptingWork_idx" ON "EngineerProfile"("verifiedAt", "isAcceptingWork");

ALTER TABLE "EngineerProfile"
    ADD CONSTRAINT "EngineerProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

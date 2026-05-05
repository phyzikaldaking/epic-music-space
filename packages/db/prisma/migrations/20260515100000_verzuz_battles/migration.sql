-- VerzuzMatch
CREATE TABLE IF NOT EXISTS "VerzuzMatch" (
  "id" TEXT NOT NULL,
  "artistAId" TEXT NOT NULL,
  "artistBId" TEXT NOT NULL,
  "artistAName" TEXT NOT NULL,
  "artistBName" TEXT NOT NULL,
  "theme" TEXT,
  "totalRounds" INTEGER NOT NULL DEFAULT 10,
  "currentRound" INTEGER NOT NULL DEFAULT 1,
  "roundDurationSec" INTEGER NOT NULL DEFAULT 180,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerzuzMatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VerzuzMatch_status_startsAt_idx" ON "VerzuzMatch"("status", "startsAt");
CREATE INDEX IF NOT EXISTS "VerzuzMatch_artistAId_idx" ON "VerzuzMatch"("artistAId");
CREATE INDEX IF NOT EXISTS "VerzuzMatch_artistBId_idx" ON "VerzuzMatch"("artistBId");
DO $$ BEGIN
  ALTER TABLE "VerzuzMatch" ADD CONSTRAINT "VerzuzMatch_artistAId_fkey"
    FOREIGN KEY ("artistAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VerzuzMatch" ADD CONSTRAINT "VerzuzMatch_artistBId_fkey"
    FOREIGN KEY ("artistBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- VerzuzRound
CREATE TABLE IF NOT EXISTS "VerzuzRound" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "songAId" TEXT NOT NULL,
  "songBId" TEXT NOT NULL,
  "votesA" INTEGER NOT NULL DEFAULT 0,
  "votesB" INTEGER NOT NULL DEFAULT 0,
  "winner" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerzuzRound_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VerzuzRound_matchId_roundNumber_key" ON "VerzuzRound"("matchId", "roundNumber");
CREATE INDEX IF NOT EXISTS "VerzuzRound_matchId_roundNumber_idx" ON "VerzuzRound"("matchId", "roundNumber");
DO $$ BEGIN
  ALTER TABLE "VerzuzRound" ADD CONSTRAINT "VerzuzRound_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "VerzuzMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VerzuzRound" ADD CONSTRAINT "VerzuzRound_songAId_fkey"
    FOREIGN KEY ("songAId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VerzuzRound" ADD CONSTRAINT "VerzuzRound_songBId_fkey"
    FOREIGN KEY ("songBId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- VerzuzVote
CREATE TABLE IF NOT EXISTS "VerzuzVote" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "voterId" TEXT NOT NULL,
  "votedSongId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerzuzVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VerzuzVote_matchId_roundNumber_voterId_key" ON "VerzuzVote"("matchId", "roundNumber", "voterId");
CREATE INDEX IF NOT EXISTS "VerzuzVote_matchId_roundNumber_idx" ON "VerzuzVote"("matchId", "roundNumber");
DO $$ BEGIN
  ALTER TABLE "VerzuzVote" ADD CONSTRAINT "VerzuzVote_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "VerzuzMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VerzuzVote" ADD CONSTRAINT "VerzuzVote_voterId_fkey"
    FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

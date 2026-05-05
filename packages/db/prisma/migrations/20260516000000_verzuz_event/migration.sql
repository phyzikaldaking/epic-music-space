-- Verzuz event-grade upgrade: RSVP, live reactions, audience chat,
-- host notes, cover, reminder dedupe timestamps, tier (MAIN_EVENT vs SPEED).

ALTER TABLE "VerzuzMatch" ADD COLUMN IF NOT EXISTS "tier" TEXT NOT NULL DEFAULT 'MAIN_EVENT';
ALTER TABLE "VerzuzMatch" ADD COLUMN IF NOT EXISTS "hostNotes" TEXT;
ALTER TABLE "VerzuzMatch" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
ALTER TABLE "VerzuzMatch" ADD COLUMN IF NOT EXISTS "reminder24hSentAt" TIMESTAMP(3);
ALTER TABLE "VerzuzMatch" ADD COLUMN IF NOT EXISTS "reminder1hSentAt" TIMESTAMP(3);
ALTER TABLE "VerzuzMatch" ADD COLUMN IF NOT EXISTS "reminder5mSentAt" TIMESTAMP(3);
ALTER TABLE "VerzuzMatch" ADD COLUMN IF NOT EXISTS "liveStartSentAt" TIMESTAMP(3);

-- VerzuzRSVP
CREATE TABLE IF NOT EXISTS "VerzuzRSVP" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'GOING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerzuzRSVP_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VerzuzRSVP_matchId_userId_key" ON "VerzuzRSVP"("matchId", "userId");
CREATE INDEX IF NOT EXISTS "VerzuzRSVP_matchId_idx" ON "VerzuzRSVP"("matchId");
CREATE INDEX IF NOT EXISTS "VerzuzRSVP_userId_idx" ON "VerzuzRSVP"("userId");
DO $$ BEGIN
  ALTER TABLE "VerzuzRSVP" ADD CONSTRAINT "VerzuzRSVP_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "VerzuzMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VerzuzRSVP" ADD CONSTRAINT "VerzuzRSVP_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- VerzuzReaction (live emoji burst)
CREATE TABLE IF NOT EXISTS "VerzuzReaction" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerzuzReaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VerzuzReaction_matchId_roundNumber_idx" ON "VerzuzReaction"("matchId", "roundNumber");
CREATE INDEX IF NOT EXISTS "VerzuzReaction_matchId_createdAt_idx" ON "VerzuzReaction"("matchId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "VerzuzReaction" ADD CONSTRAINT "VerzuzReaction_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "VerzuzMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VerzuzReaction" ADD CONSTRAINT "VerzuzReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- VerzuzMessage (live chat)
CREATE TABLE IF NOT EXISTS "VerzuzMessage" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "isHidden" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerzuzMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VerzuzMessage_matchId_createdAt_idx" ON "VerzuzMessage"("matchId", "createdAt");
CREATE INDEX IF NOT EXISTS "VerzuzMessage_matchId_roundNumber_idx" ON "VerzuzMessage"("matchId", "roundNumber");
DO $$ BEGIN
  ALTER TABLE "VerzuzMessage" ADD CONSTRAINT "VerzuzMessage_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "VerzuzMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VerzuzMessage" ADD CONSTRAINT "VerzuzMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

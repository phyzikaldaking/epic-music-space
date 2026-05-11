-- Clubhouse-style stage + audience for rooms. HOST + SPEAKER count
-- toward `stageLimit` (resolved at room create from host's tier in
-- roomTier.ts); LISTENER counts toward existing `maxCapacity`.
--
-- New tables:
--   RoomReaction  — audience emoji taps (🔥 ❤️ 👏)
--   RoomPoll      — host-dropped polls ("which kick?")
--   RoomPollVote  — one row per voter, unique on (poll, user)
--   RoomTip       — money thrown on stage; mirrors VersusTip shape

ALTER TABLE "Room"
  ADD COLUMN IF NOT EXISTS "stageLimit" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "studioProjectId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Room_studioProjectId_key"
  ON "Room"("studioProjectId");

CREATE INDEX IF NOT EXISTS "Room_studioProjectId_idx"
  ON "Room"("studioProjectId");

ALTER TABLE "Room"
  ADD CONSTRAINT "Room_studioProjectId_fkey"
  FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RoomReaction ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RoomReaction" (
  "id"        TEXT PRIMARY KEY,
  "roomId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "kind"      VARCHAR(8) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoomReaction_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RoomReaction_roomId_createdAt_idx"
  ON "RoomReaction"("roomId", "createdAt");

-- ── RoomPoll + RoomPollVote ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RoomPoll" (
  "id"        TEXT PRIMARY KEY,
  "roomId"    TEXT NOT NULL,
  "authorId"  TEXT NOT NULL,
  "question"  VARCHAR(140) NOT NULL,
  "options"   JSONB NOT NULL,
  "closesAt"  TIMESTAMP(3),
  "closedAt"  TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoomPoll_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomPoll_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RoomPoll_roomId_createdAt_idx"
  ON "RoomPoll"("roomId", "createdAt");

CREATE TABLE IF NOT EXISTS "RoomPollVote" (
  "id"        TEXT PRIMARY KEY,
  "pollId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "optionId"  VARCHAR(40) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RoomPollVote_pollId_fkey"
    FOREIGN KEY ("pollId") REFERENCES "RoomPoll"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomPollVote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RoomPollVote_pollId_userId_key"
  ON "RoomPollVote"("pollId", "userId");
CREATE INDEX IF NOT EXISTS "RoomPollVote_pollId_idx"
  ON "RoomPollVote"("pollId");

-- ── RoomTipStatus + RoomTip ─────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "RoomTipStatus" AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RoomTip" (
  "id"                    TEXT PRIMARY KEY,
  "roomId"                TEXT NOT NULL,
  "tipperId"              TEXT NOT NULL,
  "recipientId"           TEXT,
  "amountUsd"             DECIMAL(10,2) NOT NULL,
  "note"                  VARCHAR(140),
  "status"                "RoomTipStatus" NOT NULL DEFAULT 'PENDING',
  "stripeSessionId"       TEXT,
  "stripePaymentIntentId" TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"                TIMESTAMP(3),

  CONSTRAINT "RoomTip_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomTip_tipperId_fkey"
    FOREIGN KEY ("tipperId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomTip_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RoomTip_stripeSessionId_key"
  ON "RoomTip"("stripeSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "RoomTip_stripePaymentIntentId_key"
  ON "RoomTip"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "RoomTip_roomId_status_idx"
  ON "RoomTip"("roomId", "status");
CREATE INDEX IF NOT EXISTS "RoomTip_tipperId_idx"
  ON "RoomTip"("tipperId");
CREATE INDEX IF NOT EXISTS "RoomTip_recipientId_idx"
  ON "RoomTip"("recipientId");

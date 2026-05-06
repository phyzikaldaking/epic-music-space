-- Two-sided invitation flow for Verzuz matches. Mirrors VersusChallenge.
-- The challenger proposes opponent + theme + setlist + start time;
-- the opponent accepts (with their own setlist) which the API then
-- atomically converts into a VerzuzMatch row + 10 zipped VerzuzRound rows.
--
-- Idempotent / safe to re-run: guarded CREATE TYPE + IF NOT EXISTS table.

DO $$ BEGIN
  CREATE TYPE "VerzuzChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "VerzuzChallenge" (
  "id"                       TEXT                    NOT NULL,
  "challengerId"             TEXT                    NOT NULL,
  "opponentId"               TEXT                    NOT NULL,
  "challengerSongIds"        TEXT[]                  NOT NULL,
  "opponentSongIds"          TEXT[]                  NOT NULL DEFAULT ARRAY[]::TEXT[],
  "proposedTheme"            TEXT,
  "proposedTotalRounds"      INTEGER                 NOT NULL DEFAULT 10,
  "proposedRoundDurationSec" INTEGER                 NOT NULL DEFAULT 180,
  "proposedTier"             TEXT                    NOT NULL DEFAULT 'MAIN_EVENT',
  "proposedStartsAt"         TIMESTAMP(3)            NOT NULL,
  "status"                   "VerzuzChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "message"                  TEXT,
  "createdAt"                TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"                TIMESTAMP(3)            NOT NULL,
  "acceptedAt"               TIMESTAMP(3),
  "declinedAt"               TIMESTAMP(3),
  "matchId"                  TEXT,
  CONSTRAINT "VerzuzChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VerzuzChallenge_matchId_key"     ON "VerzuzChallenge"("matchId");
CREATE INDEX        IF NOT EXISTS "VerzuzChallenge_opponent_idx"    ON "VerzuzChallenge"("opponentId", "status");
CREATE INDEX        IF NOT EXISTS "VerzuzChallenge_challenger_idx"  ON "VerzuzChallenge"("challengerId", "status");
CREATE INDEX        IF NOT EXISTS "VerzuzChallenge_expiresAt_idx"   ON "VerzuzChallenge"("expiresAt");

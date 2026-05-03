CREATE TABLE "BattleRoyale" (
  "id"        TEXT         NOT NULL,
  "creatorId" TEXT         NOT NULL,
  "status"    "VersusStatus" NOT NULL DEFAULT 'ACTIVE',
  "endsAt"    TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BattleRoyale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BattleRoyaleEntry" (
  "id"       TEXT    NOT NULL,
  "battleId" TEXT    NOT NULL,
  "songId"   TEXT    NOT NULL,
  "votes"    INTEGER NOT NULL DEFAULT 0,
  "position" INTEGER NOT NULL,
  CONSTRAINT "BattleRoyaleEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BattleRoyaleVote" (
  "id"        TEXT         NOT NULL,
  "battleId"  TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "songId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BattleRoyaleVote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BattleRoyale_status_idx"  ON "BattleRoyale"("status");
CREATE INDEX "BattleRoyale_endsAt_idx"  ON "BattleRoyale"("endsAt");
CREATE UNIQUE INDEX "BattleRoyaleVote_battleId_userId_key" ON "BattleRoyaleVote"("battleId", "userId");
CREATE INDEX "BattleRoyaleVote_battleId_idx" ON "BattleRoyaleVote"("battleId");

ALTER TABLE "BattleRoyale"
  ADD CONSTRAINT "BattleRoyale_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BattleRoyaleEntry"
  ADD CONSTRAINT "BattleRoyaleEntry_battleId_fkey"
  FOREIGN KEY ("battleId") REFERENCES "BattleRoyale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BattleRoyaleEntry"
  ADD CONSTRAINT "BattleRoyaleEntry_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BattleRoyaleVote"
  ADD CONSTRAINT "BattleRoyaleVote_battleId_fkey"
  FOREIGN KEY ("battleId") REFERENCES "BattleRoyale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BattleRoyaleVote"
  ADD CONSTRAINT "BattleRoyaleVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

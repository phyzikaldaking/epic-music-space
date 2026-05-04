SET lock_timeout = '5s';

-- CreateEnum
CREATE TYPE "VersusChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "VersusTipStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE IF NOT EXISTS "VersusChallenge" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "challengerSongId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "opponentSongId" TEXT,
    "status" "VersusChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "durationHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "matchId" TEXT,

    CONSTRAINT "VersusChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VersusChallenge_matchId_key" ON "VersusChallenge"("matchId");
CREATE INDEX IF NOT EXISTS "VersusChallenge_opponentId_status_idx" ON "VersusChallenge"("opponentId", "status");
CREATE INDEX IF NOT EXISTS "VersusChallenge_challengerId_status_idx" ON "VersusChallenge"("challengerId", "status");
CREATE INDEX IF NOT EXISTS "VersusChallenge_expiresAt_idx" ON "VersusChallenge"("expiresAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "VersusTip" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "votedSongId" TEXT NOT NULL,
    "amountUsd" DECIMAL(10,2) NOT NULL,
    "status" "VersusTipStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "VersusTip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VersusTip_stripeSessionId_key" ON "VersusTip"("stripeSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "VersusTip_stripePaymentIntentId_key" ON "VersusTip"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "VersusTip_matchId_idx" ON "VersusTip"("matchId");
CREATE INDEX IF NOT EXISTS "VersusTip_voterId_idx" ON "VersusTip"("voterId");
CREATE INDEX IF NOT EXISTS "VersusTip_status_idx" ON "VersusTip"("status");

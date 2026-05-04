-- AlterTable: Payout.songId → nullable + add unique(userId, period)
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_songId_fkey";
ALTER TABLE "Payout" ALTER COLUMN "songId" DROP NOT NULL;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same userId+period must produce the same Payout row (idempotent cron)
CREATE UNIQUE INDEX "Payout_userId_period_key" ON "Payout"("userId", "period");

-- ProcessedWebhook (event-id dedupe across all webhook sources)
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProcessedWebhook_source_eventId_key" ON "ProcessedWebhook"("source", "eventId");
CREATE INDEX "ProcessedWebhook_processedAt_idx" ON "ProcessedWebhook"("processedAt");

-- PayoutFailure (persistent record of every failed payout attempt)
CREATE TABLE "PayoutFailure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payoutId" TEXT,
    "period" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutFailure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayoutFailure_userId_createdAt_idx" ON "PayoutFailure"("userId", "createdAt");
CREATE INDEX "PayoutFailure_period_idx" ON "PayoutFailure"("period");
ALTER TABLE "PayoutFailure" ADD CONSTRAINT "PayoutFailure_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "RevenueEventType" AS ENUM ('LICENSE_SALE', 'TIP', 'AD_PURCHASE', 'STREAM_ROYALTY', 'AUCTION_WIN', 'REFUND');

-- CreateEnum
CREATE TYPE "RevenueSplitRole" AS ENUM ('ARTIST', 'HOLDER', 'LABEL', 'PLATFORM', 'HOST');

-- CreateEnum
CREATE TYPE "RevenueSplitStatus" AS ENUM ('PENDING', 'PAID', 'CLAWED_BACK', 'EXCLUDED');

-- AlterTable: Payout — track Stripe transfer id for idempotency / reconciliation
ALTER TABLE "Payout" ADD COLUMN "stripeTransferId" TEXT;
CREATE UNIQUE INDEX "Payout_stripeTransferId_key" ON "Payout"("stripeTransferId");

-- CreateTable: AdImpression
CREATE TABLE "AdImpression" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdImpression_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdImpression_placementId_createdAt_idx" ON "AdImpression"("placementId", "createdAt");
CREATE INDEX "AdImpression_userId_createdAt_idx" ON "AdImpression"("userId", "createdAt");
CREATE INDEX "AdImpression_ipHash_placementId_createdAt_idx" ON "AdImpression"("ipHash", "placementId", "createdAt");
ALTER TABLE "AdImpression" ADD CONSTRAINT "AdImpression_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AdClick
CREATE TABLE "AdClick" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdClick_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdClick_placementId_createdAt_idx" ON "AdClick"("placementId", "createdAt");
CREATE INDEX "AdClick_userId_createdAt_idx" ON "AdClick"("userId", "createdAt");
ALTER TABLE "AdClick" ADD CONSTRAINT "AdClick_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: AdPlacement perf
CREATE INDEX "AdPlacement_location_isActive_startDate_endDate_idx" ON "AdPlacement"("location", "isActive", "startDate", "endDate");
CREATE INDEX "AdPlacement_ownerId_idx" ON "AdPlacement"("ownerId");

-- CreateTable: RevenueEvent
CREATE TABLE "RevenueEvent" (
    "id" TEXT NOT NULL,
    "type" "RevenueEventType" NOT NULL,
    "songId" TEXT,
    "transactionId" TEXT,
    "adPlacementId" TEXT,
    "grossCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RevenueEvent_transactionId_key" ON "RevenueEvent"("transactionId");
CREATE INDEX "RevenueEvent_type_occurredAt_idx" ON "RevenueEvent"("type", "occurredAt");
CREATE INDEX "RevenueEvent_songId_occurredAt_idx" ON "RevenueEvent"("songId", "occurredAt");
ALTER TABLE "RevenueEvent" ADD CONSTRAINT "RevenueEvent_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RevenueEvent" ADD CONSTRAINT "RevenueEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RevenueEvent" ADD CONSTRAINT "RevenueEvent_adPlacementId_fkey" FOREIGN KEY ("adPlacementId") REFERENCES "AdPlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: RevenueSplit
CREATE TABLE "RevenueSplit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RevenueSplitRole" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "RevenueSplitStatus" NOT NULL DEFAULT 'PENDING',
    "payoutId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueSplit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RevenueSplit_userId_status_idx" ON "RevenueSplit"("userId", "status");
CREATE INDEX "RevenueSplit_eventId_idx" ON "RevenueSplit"("eventId");
CREATE INDEX "RevenueSplit_payoutId_idx" ON "RevenueSplit"("payoutId");
ALTER TABLE "RevenueSplit" ADD CONSTRAINT "RevenueSplit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RevenueEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevenueSplit" ADD CONSTRAINT "RevenueSplit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevenueSplit" ADD CONSTRAINT "RevenueSplit_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

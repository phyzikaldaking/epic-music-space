-- AlterEnum: Role gets PRODUCER and ENGINEER
ALTER TYPE "Role" ADD VALUE 'PRODUCER';
ALTER TYPE "Role" ADD VALUE 'ENGINEER';

-- AlterEnum: TransactionType gets SERVICE_PURCHASE
ALTER TYPE "TransactionType" ADD VALUE 'SERVICE_PURCHASE';

-- AlterEnum: RevenueEventType gets SERVICE_SALE
ALTER TYPE "RevenueEventType" ADD VALUE 'SERVICE_SALE';

-- CreateEnum: ServiceListingKind
CREATE TYPE "ServiceListingKind" AS ENUM (
  'MIX', 'MASTER', 'MIX_MASTER_BUNDLE',
  'PRODUCER_TEMPLATE', 'BEAT', 'DRUM_KIT', 'SAMPLE_PACK',
  'LESSON'
);

-- CreateEnum: ServiceListingStatus
CREATE TYPE "ServiceListingStatus" AS ENUM ('LIVE', 'PAUSED', 'SOLD_OUT', 'ARCHIVED');

-- CreateEnum: ServiceOrderStatus
CREATE TYPE "ServiceOrderStatus" AS ENUM (
  'PENDING', 'PAID', 'IN_PROGRESS', 'DELIVERED', 'REFUNDED', 'CANCELLED'
);

-- CreateTable: ServiceListing
CREATE TABLE "ServiceListing" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "ServiceListingKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "deliveryDays" INTEGER NOT NULL DEFAULT 7,
    "exampleAudioUrl" TEXT,
    "coverUrl" TEXT,
    "downloadUrl" TEXT,
    "status" "ServiceListingStatus" NOT NULL DEFAULT 'LIVE',
    "totalSold" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceListing_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceListing_status_kind_createdAt_idx" ON "ServiceListing"("status", "kind", "createdAt");
CREATE INDEX "ServiceListing_providerId_status_idx" ON "ServiceListing"("providerId", "status");
ALTER TABLE "ServiceListing" ADD CONSTRAINT "ServiceListing_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ServiceOrder
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "briefText" TEXT,
    "briefUrl" TEXT,
    "deliverableUrl" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceOrder_stripeSessionId_key" ON "ServiceOrder"("stripeSessionId");
CREATE UNIQUE INDEX "ServiceOrder_stripePaymentIntentId_key" ON "ServiceOrder"("stripePaymentIntentId");
CREATE INDEX "ServiceOrder_buyerId_status_idx" ON "ServiceOrder"("buyerId", "status");
CREATE INDEX "ServiceOrder_providerId_status_idx" ON "ServiceOrder"("providerId", "status");
CREATE INDEX "ServiceOrder_listingId_status_idx" ON "ServiceOrder"("listingId", "status");
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

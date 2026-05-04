-- Add new ServiceOrderStatus values
ALTER TYPE "ServiceOrderStatus" ADD VALUE 'REVISION_REQUESTED';
ALTER TYPE "ServiceOrderStatus" ADD VALUE 'COMPLETED';

-- Extend ServiceOrder
ALTER TABLE "ServiceOrder" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "ServiceOrder" ADD COLUMN "acceptDeadline" TIMESTAMP(3);
ALTER TABLE "ServiceOrder" ADD COLUMN "revisionsUsed" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ServiceOrder_status_acceptDeadline_idx" ON "ServiceOrder"("status", "acceptDeadline");

-- ServiceOrderMessage
CREATE TABLE "ServiceOrderMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceOrderMessage_orderId_createdAt_idx" ON "ServiceOrderMessage"("orderId", "createdAt");
ALTER TABLE "ServiceOrderMessage" ADD CONSTRAINT "ServiceOrderMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOrderMessage" ADD CONSTRAINT "ServiceOrderMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ServiceOrderRevision
CREATE TABLE "ServiceOrderRevision" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "deliverableUrl" TEXT NOT NULL,
    "message" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceOrderRevision_orderId_revisionNumber_key" ON "ServiceOrderRevision"("orderId", "revisionNumber");
CREATE INDEX "ServiceOrderRevision_orderId_idx" ON "ServiceOrderRevision"("orderId");
ALTER TABLE "ServiceOrderRevision" ADD CONSTRAINT "ServiceOrderRevision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ServiceReview
CREATE TABLE "ServiceReview" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceReview_orderId_key" ON "ServiceReview"("orderId");
CREATE INDEX "ServiceReview_listingId_createdAt_idx" ON "ServiceReview"("listingId", "createdAt");
CREATE INDEX "ServiceReview_providerId_createdAt_idx" ON "ServiceReview"("providerId", "createdAt");
ALTER TABLE "ServiceReview" ADD CONSTRAINT "ServiceReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceReview" ADD CONSTRAINT "ServiceReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ServiceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceReview" ADD CONSTRAINT "ServiceReview_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

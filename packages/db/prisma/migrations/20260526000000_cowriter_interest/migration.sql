-- CoWriterInterest: tracks fans who tap "Become a Co-Writer" on a
-- /track/[id] page. MVP captures intent — the actual writer-share
-- token sale runs in a follow-up Stripe checkout flow.
--
-- shareBpsRequested = basis points the fan wants (default 50 = 0.5%).
-- The artist sees the queue on their dashboard and accepts/declines.
-- When accepted, a real LicenseToken-style writer share is minted
-- and the funds capture from the fan's saved Stripe payment method.

CREATE TABLE "CoWriterInterest" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "shareBpsRequested" INTEGER NOT NULL DEFAULT 50,
    "priceCents" INTEGER NOT NULL DEFAULT 5000,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoWriterInterest_pkey" PRIMARY KEY ("id")
);

-- One interest row per fan per song. If a fan changes their mind we
-- update the existing row instead of creating a duplicate.
CREATE UNIQUE INDEX "CoWriterInterest_songId_fanId_unique" ON "CoWriterInterest"("songId", "fanId");
CREATE INDEX "CoWriterInterest_songId_status_idx" ON "CoWriterInterest"("songId", "status");
CREATE INDEX "CoWriterInterest_fanId_idx" ON "CoWriterInterest"("fanId");

ALTER TABLE "CoWriterInterest"
  ADD CONSTRAINT "CoWriterInterest_songId_fkey"
    FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CoWriterInterest_fanId_fkey"
    FOREIGN KEY ("fanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

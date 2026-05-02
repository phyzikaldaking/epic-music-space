-- Auctions, Tips, and new TransactionType enum values

-- Add new TransactionType values (safe: ALTER TYPE ... ADD VALUE is idempotent in PG 14+)
DO $$ BEGIN
  ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'TIP';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'AUCTION_WIN';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AuctionStatus enum
DO $$ BEGIN
  CREATE TYPE "AuctionStatus" AS ENUM ('ACTIVE', 'ENDED', 'SETTLED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auction table
CREATE TABLE IF NOT EXISTS "Auction" (
  "id"           TEXT NOT NULL,
  "songId"       TEXT NOT NULL,
  "sellerId"     TEXT NOT NULL,
  "startingBid"  DECIMAL(10,2) NOT NULL,
  "reservePrice" DECIMAL(10,2),
  "currentBid"   DECIMAL(10,2),
  "winnerId"     TEXT,
  "status"       "AuctionStatus" NOT NULL DEFAULT 'ACTIVE',
  "endsAt"       TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");
CREATE INDEX IF NOT EXISTS "Auction_songId_idx"         ON "Auction"("songId");
CREATE INDEX IF NOT EXISTS "Auction_sellerId_idx"       ON "Auction"("sellerId");

ALTER TABLE "Auction"
  ADD CONSTRAINT "Auction_songId_fkey"
    FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "Auction" VALIDATE CONSTRAINT "Auction_songId_fkey";

ALTER TABLE "Auction"
  ADD CONSTRAINT "Auction_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "Auction" VALIDATE CONSTRAINT "Auction_sellerId_fkey";

ALTER TABLE "Auction"
  ADD CONSTRAINT "Auction_winnerId_fkey"
    FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "Auction" VALIDATE CONSTRAINT "Auction_winnerId_fkey";

-- AuctionBid table
CREATE TABLE IF NOT EXISTS "AuctionBid" (
  "id"        TEXT NOT NULL,
  "auctionId" TEXT NOT NULL,
  "bidderId"  TEXT NOT NULL,
  "amount"    DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuctionBid_auctionId_amount_idx" ON "AuctionBid"("auctionId", "amount" DESC);
CREATE INDEX IF NOT EXISTS "AuctionBid_bidderId_idx"         ON "AuctionBid"("bidderId");

ALTER TABLE "AuctionBid"
  ADD CONSTRAINT "AuctionBid_auctionId_fkey"
    FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "AuctionBid" VALIDATE CONSTRAINT "AuctionBid_auctionId_fkey";

ALTER TABLE "AuctionBid"
  ADD CONSTRAINT "AuctionBid_bidderId_fkey"
    FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "AuctionBid" VALIDATE CONSTRAINT "AuctionBid_bidderId_fkey";

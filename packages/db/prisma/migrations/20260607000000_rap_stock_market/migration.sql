-- Rap stock market: verse marketplace + joint-session booking +
-- composite stock price snapshots.

-- Enums
DO $$ BEGIN
  CREATE TYPE "VerseListingKind" AS ENUM ('LIVE_SESSION','ASYNC_DELIVERY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "VerseListingStatus" AS ENUM ('ACTIVE','PAUSED','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SessionBookingStatus" AS ENUM (
    'PENDING_PAYMENT','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- VerseListing
CREATE TABLE IF NOT EXISTS "VerseListing" (
  "id"             TEXT PRIMARY KEY,
  "sellerId"       TEXT NOT NULL,
  "kind"           "VerseListingKind" NOT NULL DEFAULT 'LIVE_SESSION',
  "status"         "VerseListingStatus" NOT NULL DEFAULT 'ACTIVE',
  "title"          VARCHAR(120) NOT NULL,
  "description"    TEXT,
  "priceUsd"       DECIMAL(10,2) NOT NULL,
  "sessionMinutes" INTEGER NOT NULL DEFAULT 60,
  "deliveryDays"   INTEGER NOT NULL DEFAULT 3,
  "previewSongId"  TEXT,
  "tags"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VerseListing_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VerseListing_sellerId_status_idx" ON "VerseListing"("sellerId","status");
CREATE INDEX IF NOT EXISTS "VerseListing_status_createdAt_idx" ON "VerseListing"("status","createdAt");
CREATE INDEX IF NOT EXISTS "VerseListing_kind_idx" ON "VerseListing"("kind");

-- SessionBooking
CREATE TABLE IF NOT EXISTS "SessionBooking" (
  "id"                    TEXT PRIMARY KEY,
  "listingId"             TEXT NOT NULL,
  "buyerId"               TEXT NOT NULL,
  "sellerId"              TEXT NOT NULL,
  "startAt"               TIMESTAMP(3),
  "roomId"                TEXT,
  "status"                "SessionBookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "agreedPriceUsd"        DECIMAL(10,2) NOT NULL,
  "deliveredAt"           TIMESTAMP(3),
  "deliveredAudioUrl"     TEXT,
  "buyerSignedOffAt"      TIMESTAMP(3),
  "sellerSignedOffAt"     TIMESTAMP(3),
  "stripeSessionId"       TEXT,
  "stripePaymentIntentId" TEXT,
  "brief"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionBooking_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "VerseListing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionBooking_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionBooking_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SessionBooking_roomId_key" ON "SessionBooking"("roomId");
CREATE UNIQUE INDEX IF NOT EXISTS "SessionBooking_stripeSessionId_key" ON "SessionBooking"("stripeSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "SessionBooking_stripePaymentIntentId_key" ON "SessionBooking"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "SessionBooking_buyerId_status_idx" ON "SessionBooking"("buyerId","status");
CREATE INDEX IF NOT EXISTS "SessionBooking_sellerId_status_idx" ON "SessionBooking"("sellerId","status");
CREATE INDEX IF NOT EXISTS "SessionBooking_startAt_idx" ON "SessionBooking"("startAt");
CREATE INDEX IF NOT EXISTS "SessionBooking_status_startAt_idx" ON "SessionBooking"("status","startAt");

-- ArtistStockSnapshot
CREATE TABLE IF NOT EXISTS "ArtistStockSnapshot" (
  "id"                  TEXT PRIMARY KEY,
  "artistId"            TEXT NOT NULL,
  "price"               DECIMAL(10,4) NOT NULL,
  "verseRevenue30d"     DECIMAL(10,2) NOT NULL,
  "avgVersePrice"       DECIMAL(10,2) NOT NULL,
  "repeatBuyerRate"     DECIMAL(5,4) NOT NULL,
  "bookings30d"         INTEGER NOT NULL,
  "followerGrowth30d"   INTEGER NOT NULL,
  "capturedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArtistStockSnapshot_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ArtistStockSnapshot_artistId_capturedAt_key"
  ON "ArtistStockSnapshot"("artistId","capturedAt");
CREATE INDEX IF NOT EXISTS "ArtistStockSnapshot_artistId_capturedAt_idx"
  ON "ArtistStockSnapshot"("artistId","capturedAt");
CREATE INDEX IF NOT EXISTS "ArtistStockSnapshot_capturedAt_idx"
  ON "ArtistStockSnapshot"("capturedAt");

-- EMS relationship system: Investors, Allies, Stakeholders, and Clients.
-- This migration intentionally adds new tables beside the existing UserFollow model.

CREATE TABLE IF NOT EXISTS "ArtistInvestor" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tier" TEXT NOT NULL DEFAULT 'OBSERVER',
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArtistInvestor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AllyConnection" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "receiverId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),

  CONSTRAINT "AllyConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StakeholderAccess" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tier" TEXT NOT NULL DEFAULT 'STAKEHOLDER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StakeholderAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClientRelationship" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'DIRECT',
  "lifetimeValueCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOrderAt" TIMESTAMP(3),

  CONSTRAINT "ClientRelationship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArtistInvestor_artistId_userId_key" ON "ArtistInvestor"("artistId", "userId");
CREATE INDEX IF NOT EXISTS "ArtistInvestor_artistId_idx" ON "ArtistInvestor"("artistId");
CREATE INDEX IF NOT EXISTS "ArtistInvestor_userId_idx" ON "ArtistInvestor"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "AllyConnection_requesterId_receiverId_key" ON "AllyConnection"("requesterId", "receiverId");
CREATE INDEX IF NOT EXISTS "AllyConnection_requesterId_idx" ON "AllyConnection"("requesterId");
CREATE INDEX IF NOT EXISTS "AllyConnection_receiverId_idx" ON "AllyConnection"("receiverId");
CREATE INDEX IF NOT EXISTS "AllyConnection_status_idx" ON "AllyConnection"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "StakeholderAccess_artistId_userId_key" ON "StakeholderAccess"("artistId", "userId");
CREATE INDEX IF NOT EXISTS "StakeholderAccess_artistId_idx" ON "StakeholderAccess"("artistId");
CREATE INDEX IF NOT EXISTS "StakeholderAccess_userId_idx" ON "StakeholderAccess"("userId");
CREATE INDEX IF NOT EXISTS "StakeholderAccess_status_idx" ON "StakeholderAccess"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "ClientRelationship_artistId_userId_key" ON "ClientRelationship"("artistId", "userId");
CREATE INDEX IF NOT EXISTS "ClientRelationship_artistId_idx" ON "ClientRelationship"("artistId");
CREATE INDEX IF NOT EXISTS "ClientRelationship_userId_idx" ON "ClientRelationship"("userId");
CREATE INDEX IF NOT EXISTS "ClientRelationship_lastOrderAt_idx" ON "ClientRelationship"("lastOrderAt");

ALTER TABLE "ArtistInvestor"
  ADD CONSTRAINT "ArtistInvestor_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArtistInvestor"
  ADD CONSTRAINT "ArtistInvestor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AllyConnection"
  ADD CONSTRAINT "AllyConnection_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AllyConnection"
  ADD CONSTRAINT "AllyConnection_receiverId_fkey"
  FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StakeholderAccess"
  ADD CONSTRAINT "StakeholderAccess_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StakeholderAccess"
  ADD CONSTRAINT "StakeholderAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientRelationship"
  ADD CONSTRAINT "ClientRelationship_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientRelationship"
  ADD CONSTRAINT "ClientRelationship_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

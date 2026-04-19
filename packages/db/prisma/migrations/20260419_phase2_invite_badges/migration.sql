-- Phase 2: Invite Engine + Badges + Studio Level

-- BadgeType enum
CREATE TYPE "BadgeType" AS ENUM (
  'EARLY_ADOPTER',
  'INVITE_5',
  'INVITE_10',
  'INVITE_50',
  'FIRST_BATTLE_WIN',
  'FIRST_LICENSE_SOLD',
  'LICENSE_HOLDER',
  'TOP_ARTIST'
);

-- InviteCode table
CREATE TABLE "InviteCode" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt"      TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "usedById"    TEXT,

  CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");
CREATE UNIQUE INDEX "InviteCode_usedById_key" ON "InviteCode"("usedById");

ALTER TABLE "InviteCode"
  ADD CONSTRAINT "InviteCode_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InviteCode"
  ADD CONSTRAINT "InviteCode_usedById_fkey"
    FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UserBadge table
CREATE TABLE "UserBadge" (
  "id"        TEXT NOT NULL,
  "type"      "BadgeType" NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId"    TEXT NOT NULL,

  CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBadge_userId_type_key" ON "UserBadge"("userId", "type");

ALTER TABLE "UserBadge"
  ADD CONSTRAINT "UserBadge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add level to Studio
ALTER TABLE "Studio" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;

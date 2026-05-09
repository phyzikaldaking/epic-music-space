-- Redeem codes + per-user reward counters.
--
-- Codes are minted by admins and redeemed at /redeem. Each redemption
-- bumps stackable counters on User: bonusSongSlots, freeBoostCredits,
-- freeLicenseFeeWaivers, and may push trialExpiresAt forward by N days.
-- Counters are decremented at consume sites (upload, boost, license sale).

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "bonusSongSlots"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "freeBoostCredits"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "freeLicenseFeeWaivers" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "RedeemCode" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "reward"      JSONB NOT NULL,
  "maxUses"     INTEGER,
  "uses"        INTEGER NOT NULL DEFAULT 0,
  "expiresAt"   TIMESTAMP(3),
  "description" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "frozenAt"    TIMESTAMP(3),

  CONSTRAINT "RedeemCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RedeemCode_code_key"
  ON "RedeemCode" ("code");

CREATE INDEX IF NOT EXISTS "RedeemCode_expiresAt_idx"
  ON "RedeemCode" ("expiresAt");

CREATE INDEX IF NOT EXISTS "RedeemCode_createdById_createdAt_idx"
  ON "RedeemCode" ("createdById", "createdAt");

CREATE TABLE IF NOT EXISTS "RedeemRedemption" (
  "id"        TEXT NOT NULL,
  "codeId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "reward"    JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RedeemRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RedeemRedemption_codeId_userId_key"
  ON "RedeemRedemption" ("codeId", "userId");

CREATE INDEX IF NOT EXISTS "RedeemRedemption_userId_createdAt_idx"
  ON "RedeemRedemption" ("userId", "createdAt");

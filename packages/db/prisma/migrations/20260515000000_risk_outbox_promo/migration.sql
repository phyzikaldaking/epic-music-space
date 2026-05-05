-- Migration: risk scoring fields + email outbox + promo freeze

-- Risk / trust fields on User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "suspicionScore"  INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "flaggedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isSuspended"     BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "suspendedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "emailBounced"    BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emailBouncedAt"  TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_isSuspended_idx" ON "User"("isSuspended");
CREATE INDEX IF NOT EXISTS "User_suspicionScore_idx" ON "User"("suspicionScore");

-- EmailOutbox
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailOutboxStatus') THEN
    CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EmailOutbox" (
  "id"        TEXT        NOT NULL,
  "messageId" TEXT        NOT NULL,
  "userId"    TEXT,
  "to"        TEXT        NOT NULL,
  "subject"   TEXT        NOT NULL,
  "html"      TEXT        NOT NULL,
  "text"      TEXT,
  "status"    "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"  INTEGER     NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailOutbox_messageId_key" ON "EmailOutbox"("messageId");
CREATE INDEX IF NOT EXISTS "EmailOutbox_status_createdAt_idx" ON "EmailOutbox"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailOutbox_userId_idx" ON "EmailOutbox"("userId");

-- PromoCodeFreeze
CREATE TABLE IF NOT EXISTS "PromoCodeFreeze" (
  "id"          TEXT        NOT NULL,
  "couponId"    TEXT        NOT NULL,
  "frozenBy"    TEXT        NOT NULL,
  "frozenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason"      TEXT,
  "unfrozenAt"  TIMESTAMP(3),
  "unfrozenBy"  TEXT,

  CONSTRAINT "PromoCodeFreeze_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromoCodeFreeze_couponId_key" ON "PromoCodeFreeze"("couponId");
CREATE INDEX IF NOT EXISTS "PromoCodeFreeze_couponId_idx" ON "PromoCodeFreeze"("couponId");
CREATE INDEX IF NOT EXISTS "PromoCodeFreeze_frozenAt_idx" ON "PromoCodeFreeze"("frozenAt");

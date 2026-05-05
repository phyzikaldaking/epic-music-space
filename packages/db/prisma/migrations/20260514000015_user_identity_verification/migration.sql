-- Stripe Identity verification fields. Idempotent so a re-run on a
-- migrated DB is a no-op.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "stripeIdentitySessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "identityVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeIdentitySessionId_key"
  ON "User"("stripeIdentitySessionId");

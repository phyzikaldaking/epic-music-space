-- Add the verified-artist badge columns to User. Idempotent so a re-run
-- on an already-migrated DB is a no-op.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

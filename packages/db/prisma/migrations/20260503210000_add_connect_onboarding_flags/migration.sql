-- RECOVERED MIGRATION (2026-05-09)
--
-- This migration was applied directly to production on 2026-05-04
-- without ever being committed to the repo (see _prisma_migrations
-- row finished_at = 2026-05-04T01:03:11.561Z). Reconstructed here from
-- the live schema so future `prisma migrate status` checks come back
-- clean and any new environment can be bootstrapped from migrations
-- alone.
--
-- All clauses use IF NOT EXISTS so re-running this against the live
-- database (where the columns already exist) is a safe no-op.
--
-- Stripe Connect onboarding flags. Each User can connect a Stripe
-- account to receive payouts; these columns mirror the relevant fields
-- from the Stripe Account object so we can gate payout-eligible UI
-- without round-tripping to Stripe on every page load.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "connectChargesEnabled"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "connectPayoutsEnabled"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "connectDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "connectRequirements"     JSONB,
  ADD COLUMN IF NOT EXISTS "connectCountry"          TEXT;

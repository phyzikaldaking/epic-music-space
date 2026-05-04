-- Migration: fix_connect_compliance_columns
-- Ensures Stripe Connect compliance and tax columns exist on User.
-- The original migration (20260503_connect_compliance_tax) was baselined
-- without actually running, leaving the columns absent from the DB.

-- ── TaxFormStatus enum (safe if already exists) ──────────────────────────────
DO $$ BEGIN
  CREATE TYPE "TaxFormStatus" AS ENUM ('NOT_COLLECTED', 'PENDING', 'COLLECTED', 'EXEMPT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Stripe Connect compliance columns ────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "connectChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "connectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "connectRequirements"   JSONB,
  ADD COLUMN IF NOT EXISTS "connectCountry"        TEXT;

-- ── Tax compliance columns ────────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "taxFormStatus" "TaxFormStatus" NOT NULL DEFAULT 'NOT_COLLECTED',
  ADD COLUMN IF NOT EXISTS "taxIdType"     TEXT;

-- Migration: add_connect_compliance_tax
-- Adds Stripe Connect compliance tracking and tax handling fields to User model.

-- ── TaxFormStatus enum ──────────────────────────────────────────────────────
CREATE TYPE "TaxFormStatus" AS ENUM ('NOT_COLLECTED', 'PENDING', 'COLLECTED', 'EXEMPT');

-- ── Stripe Connect compliance columns ───────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "connectChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "connectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "connectRequirements"   JSONB,
  ADD COLUMN IF NOT EXISTS "connectCountry"        TEXT;

-- ── Tax compliance columns ───────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "taxFormStatus" "TaxFormStatus" NOT NULL DEFAULT 'NOT_COLLECTED',
  ADD COLUMN IF NOT EXISTS "taxIdType"     TEXT;

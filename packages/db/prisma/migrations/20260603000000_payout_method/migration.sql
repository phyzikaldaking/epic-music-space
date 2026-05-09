-- Payout method preference + PayPal payout target.
--
-- Artists default to STRIPE (existing Connect flow). Switching to PAYPAL
-- means earned funds get sent via PayPal Payouts API to paypalPayoutEmail.
-- Both rails coexist; the worker queries User.payoutMethod to decide.

DO $$ BEGIN
  CREATE TYPE "PayoutMethod" AS ENUM ('STRIPE', 'PAYPAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "payoutMethod"      "PayoutMethod" NOT NULL DEFAULT 'STRIPE',
  ADD COLUMN IF NOT EXISTS "paypalPayoutEmail" TEXT;

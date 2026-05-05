-- Migration: add_connected_accounts
-- Adds a ConnectedAccount table to store third-party OAuth tokens

CREATE TABLE IF NOT EXISTS "ConnectedAccount" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "expiresAt" INTEGER,
  "scope" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_idx" ON "ConnectedAccount" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedAccount_provider_account_idx" ON "ConnectedAccount" ("provider", "providerAccountId");

-- Foreign key to users table
ALTER TABLE "ConnectedAccount"
  ADD CONSTRAINT fk_connected_account_user FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;

-- ConnectedAccount — table created in an earlier (out-of-band) migration; this
-- block ensures parity if it isn't there yet on a fresh DB.
CREATE TABLE IF NOT EXISTS "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" INTEGER,
    "scope" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedAccount_provider_providerAccountId_key"
    ON "ConnectedAccount"("provider", "providerAccountId");
DO $$ BEGIN
  ALTER TABLE "ConnectedAccount"
    ADD CONSTRAINT "ConnectedAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- UserBlock
CREATE TABLE IF NOT EXISTS "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserBlock_blockerId_blockedId_key"
    ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
DO $$ BEGIN
  ALTER TABLE "UserBlock"
    ADD CONSTRAINT "UserBlock_blockerId_fkey"
    FOREIGN KEY ("blockerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserBlock"
    ADD CONSTRAINT "UserBlock_blockedId_fkey"
    FOREIGN KEY ("blockedId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- UserReport
CREATE TABLE IF NOT EXISTS "UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT,
    "postId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UserReport_status_createdAt_idx"
    ON "UserReport"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "UserReport_reportedUserId_idx" ON "UserReport"("reportedUserId");
CREATE INDEX IF NOT EXISTS "UserReport_postId_idx" ON "UserReport"("postId");
DO $$ BEGIN
  ALTER TABLE "UserReport"
    ADD CONSTRAINT "UserReport_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserReport"
    ADD CONSTRAINT "UserReport_reportedUserId_fkey"
    FOREIGN KEY ("reportedUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

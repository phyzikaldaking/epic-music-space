-- AI brain: feedback bot, marketing engine, beat embeddings.

-- Enums
DO $$ BEGIN
  CREATE TYPE "FeedbackSentiment" AS ENUM ('POSITIVE','NEUTRAL','NEGATIVE','BUG','FEATURE_REQUEST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MarketingPostKind" AS ENUM (
    'SEO_PAGE','SOCIAL_TWITTER','SOCIAL_INSTAGRAM','SOCIAL_TIKTOK',
    'COMMUNITY_COMMENT','EMAIL_BLAST'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MarketingPostStatus" AS ENUM (
    'DRAFT','SCHEDULED','PUBLISHED','FAILED','CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FeedbackEntry
CREATE TABLE IF NOT EXISTS "FeedbackEntry" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT,
  "body"            TEXT NOT NULL,
  "sentiment"       "FeedbackSentiment",
  "feature"         VARCHAR(60),
  "summary"         VARCHAR(280),
  "pagePath"        VARCHAR(200),
  "channel"         VARCHAR(40),
  "extractedAt"     TIMESTAMP(3),
  "actionedAt"      TIMESTAMP(3),
  "actionedNote"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedbackEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FeedbackEntry_userId_createdAt_idx" ON "FeedbackEntry"("userId","createdAt");
CREATE INDEX IF NOT EXISTS "FeedbackEntry_sentiment_createdAt_idx" ON "FeedbackEntry"("sentiment","createdAt");
CREATE INDEX IF NOT EXISTS "FeedbackEntry_feature_createdAt_idx" ON "FeedbackEntry"("feature","createdAt");
CREATE INDEX IF NOT EXISTS "FeedbackEntry_extractedAt_idx" ON "FeedbackEntry"("extractedAt");

-- AiInsight
CREATE TABLE IF NOT EXISTS "AiInsight" (
  "id"              TEXT PRIMARY KEY,
  "kind"            VARCHAR(40) NOT NULL,
  "title"           VARCHAR(200) NOT NULL,
  "body"            TEXT NOT NULL,
  "confidence"      DECIMAL(5,4) NOT NULL,
  "evidenceIds"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "recommendation"  TEXT,
  "resolvedAt"      TIMESTAMP(3),
  "resolvedNote"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiInsight_kind_createdAt_idx" ON "AiInsight"("kind","createdAt");
CREATE INDEX IF NOT EXISTS "AiInsight_resolvedAt_idx" ON "AiInsight"("resolvedAt");

-- MarketingPlan
CREATE TABLE IF NOT EXISTS "MarketingPlan" (
  "id"              TEXT PRIMARY KEY,
  "title"           VARCHAR(200) NOT NULL,
  "summary"         TEXT NOT NULL,
  "actions"         JSONB NOT NULL,
  "executedAt"      TIMESTAMP(3),
  "resultMetrics"   JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MarketingPlan_createdAt_idx" ON "MarketingPlan"("createdAt");

-- MarketingPost
CREATE TABLE IF NOT EXISTS "MarketingPost" (
  "id"              TEXT PRIMARY KEY,
  "planId"          TEXT,
  "kind"            "MarketingPostKind" NOT NULL,
  "status"          "MarketingPostStatus" NOT NULL DEFAULT 'DRAFT',
  "targetRef"       JSONB,
  "payload"         JSONB NOT NULL,
  "externalId"      TEXT,
  "scheduledFor"    TIMESTAMP(3),
  "publishedAt"     TIMESTAMP(3),
  "failedReason"    TEXT,
  "impressions"     INTEGER NOT NULL DEFAULT 0,
  "clicks"          INTEGER NOT NULL DEFAULT 0,
  "engagements"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketingPost_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "MarketingPlan"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MarketingPost_status_scheduledFor_idx" ON "MarketingPost"("status","scheduledFor");
CREATE INDEX IF NOT EXISTS "MarketingPost_kind_publishedAt_idx" ON "MarketingPost"("kind","publishedAt");
CREATE INDEX IF NOT EXISTS "MarketingPost_planId_idx" ON "MarketingPost"("planId");

-- pgvector extension for beat similarity search. Safe-ish to call;
-- requires the Postgres role to have superuser, which on Supabase
-- is granted to the project owner. If the extension already exists,
-- the IF NOT EXISTS clause makes this a no-op.
CREATE EXTENSION IF NOT EXISTS vector;

-- BeatEmbedding — metadata in normal columns, vector column added
-- via raw SQL because Prisma doesn't model vector(N) yet.
CREATE TABLE IF NOT EXISTS "BeatEmbedding" (
  "id"              TEXT PRIMARY KEY,
  "songId"          TEXT NOT NULL UNIQUE,
  "bpm"             INTEGER NOT NULL,
  "genre"           VARCHAR(40),
  "kit"             VARCHAR(40),
  "patternHex"      VARCHAR(80) NOT NULL,
  "embedding"       vector(384),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BeatEmbedding_bpm_idx" ON "BeatEmbedding"("bpm");
CREATE INDEX IF NOT EXISTS "BeatEmbedding_genre_idx" ON "BeatEmbedding"("genre");
CREATE INDEX IF NOT EXISTS "BeatEmbedding_kit_idx" ON "BeatEmbedding"("kit");
-- IVFFlat index for fast cosine similarity search. lists=100 is a
-- reasonable default up to ~1M rows; tune higher if we cross 10M.
CREATE INDEX IF NOT EXISTS "BeatEmbedding_embedding_idx"
  ON "BeatEmbedding" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

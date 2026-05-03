-- Persistent personalization tables for the viral For You feed.
-- Safe additive migration: does not alter existing product/payment tables.

CREATE TYPE "BehaviorEventType" AS ENUM (
  'view',
  'watch_75',
  'like',
  'share',
  'skip',
  'view_track'
);

CREATE TABLE "UserBehaviorEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clipId" TEXT NOT NULL,
  "songId" TEXT,
  "artist" TEXT,
  "eventType" "BehaviorEventType" NOT NULL,
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBehaviorEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserTasteProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "artistAffinity" JSONB NOT NULL DEFAULT '{}',
  "songAffinity" JSONB NOT NULL DEFAULT '{}',
  "eventAffinity" JSONB NOT NULL DEFAULT '{}',
  "skipSignals" JSONB NOT NULL DEFAULT '{}',
  "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserTasteProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTasteProfile_userId_key" ON "UserTasteProfile"("userId");
CREATE INDEX "UserBehaviorEvent_userId_createdAt_idx" ON "UserBehaviorEvent"("userId", "createdAt");
CREATE INDEX "UserBehaviorEvent_clipId_eventType_idx" ON "UserBehaviorEvent"("clipId", "eventType");
CREATE INDEX "UserBehaviorEvent_songId_eventType_idx" ON "UserBehaviorEvent"("songId", "eventType");

ALTER TABLE "UserBehaviorEvent" ADD CONSTRAINT "UserBehaviorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBehaviorEvent" ADD CONSTRAINT "UserBehaviorEvent_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserTasteProfile" ADD CONSTRAINT "UserTasteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

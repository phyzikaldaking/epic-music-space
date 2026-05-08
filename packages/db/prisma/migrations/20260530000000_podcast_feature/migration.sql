-- Podcast feature: creator-owned shows + episodes with video/audio packaging.
-- This powers the podcast hub, podcaster console, and public episode pages.

CREATE TYPE "PodcastFormat" AS ENUM ('VIDEO', 'AUDIO', 'HYBRID');
CREATE TYPE "PodcastCadence" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'SEASONAL', 'IRREGULAR');
CREATE TYPE "PodcastEpisodeStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "PodcastShow" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "tagline" VARCHAR(160),
  "description" TEXT NOT NULL,
  "category" VARCHAR(80),
  "format" "PodcastFormat" NOT NULL DEFAULT 'VIDEO',
  "cadence" "PodcastCadence" NOT NULL DEFAULT 'WEEKLY',
  "coverUrl" TEXT,
  "bannerUrl" TEXT,
  "trailerAudioUrl" TEXT,
  "featured" BOOLEAN NOT NULL DEFAULT FALSE,
  "isPublished" BOOLEAN NOT NULL DEFAULT FALSE,
  "totalViews" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PodcastShow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PodcastEpisode" (
  "id" TEXT NOT NULL,
  "showId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "synopsis" TEXT NOT NULL,
  "seasonNumber" INTEGER NOT NULL DEFAULT 1,
  "episodeNumber" INTEGER NOT NULL DEFAULT 1,
  "status" "PodcastEpisodeStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledFor" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "audioUrl" TEXT,
  "coverUrl" TEXT,
  "muxUploadId" TEXT,
  "muxAssetId" TEXT,
  "muxPlaybackId" TEXT,
  "videoStatus" "PostVideoStatus" NOT NULL DEFAULT 'NONE',
  "videoDurationSec" INTEGER,
  "videoAspectRatio" TEXT,
  "transcript" TEXT,
  "captionsUrl" TEXT,
  "durationSec" INTEGER,
  "clipCount" INTEGER NOT NULL DEFAULT 0,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "playCount" INTEGER NOT NULL DEFAULT 0,
  "roomId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PodcastEpisode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PodcastShow_slug_key" ON "PodcastShow"("slug");
CREATE UNIQUE INDEX "PodcastEpisode_muxUploadId_key" ON "PodcastEpisode"("muxUploadId");
CREATE UNIQUE INDEX "PodcastEpisode_muxAssetId_key" ON "PodcastEpisode"("muxAssetId");
CREATE UNIQUE INDEX "PodcastEpisode_muxPlaybackId_key" ON "PodcastEpisode"("muxPlaybackId");
CREATE UNIQUE INDEX "PodcastEpisode_showId_slug_key" ON "PodcastEpisode"("showId", "slug");

CREATE INDEX "PodcastShow_ownerId_createdAt_idx" ON "PodcastShow"("ownerId", "createdAt");
CREATE INDEX "PodcastShow_ownerId_isPublished_idx" ON "PodcastShow"("ownerId", "isPublished");
CREATE INDEX "PodcastShow_isPublished_featured_createdAt_idx" ON "PodcastShow"("isPublished", "featured", "createdAt");
CREATE INDEX "PodcastEpisode_showId_status_publishedAt_idx" ON "PodcastEpisode"("showId", "status", "publishedAt");
CREATE INDEX "PodcastEpisode_creatorId_status_createdAt_idx" ON "PodcastEpisode"("creatorId", "status", "createdAt");
CREATE INDEX "PodcastEpisode_status_publishedAt_idx" ON "PodcastEpisode"("status", "publishedAt");
CREATE INDEX "PodcastEpisode_roomId_idx" ON "PodcastEpisode"("roomId");

ALTER TABLE "PodcastShow"
  ADD CONSTRAINT "PodcastShow_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PodcastEpisode"
  ADD CONSTRAINT "PodcastEpisode_showId_fkey"
  FOREIGN KEY ("showId") REFERENCES "PodcastShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PodcastEpisode"
  ADD CONSTRAINT "PodcastEpisode_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PodcastEpisode"
  ADD CONSTRAINT "PodcastEpisode_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

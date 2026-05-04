-- Lock-friendly create. SavedTrack is a thin join — fast.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "SavedTrack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedTrack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SavedTrack_userId_songId_key" ON "SavedTrack"("userId", "songId");
CREATE INDEX IF NOT EXISTS "SavedTrack_userId_createdAt_idx" ON "SavedTrack"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SavedTrack_songId_idx" ON "SavedTrack"("songId");

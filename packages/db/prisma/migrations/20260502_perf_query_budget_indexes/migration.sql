-- Data/performance hardening indexes for high-traffic reads and timelines
CREATE INDEX IF NOT EXISTS "Song_isActive_aiScore_createdAt_idx"
  ON "Song"("isActive", "aiScore", "createdAt");

CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx"
  ON "Transaction"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Transaction_songId_status_idx"
  ON "Transaction"("songId", "status");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification"("userId", "createdAt");

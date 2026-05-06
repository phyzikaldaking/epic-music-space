-- TrackComment + TrackLike: per-track social signals so /api/tracks/[id]/comments
-- and /api/tracks/[id]/like can persist data. Cascade on Song / User delete so
-- account / catalog removal also clears the social graph attached to it.

CREATE TABLE "TrackComment" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrackComment_songId_createdAt_idx" ON "TrackComment"("songId", "createdAt");

ALTER TABLE "TrackComment" ADD CONSTRAINT "TrackComment_songId_fkey"
    FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackComment" ADD CONSTRAINT "TrackComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TrackLike" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrackLike_songId_userId_key" ON "TrackLike"("songId", "userId");
CREATE INDEX "TrackLike_songId_idx" ON "TrackLike"("songId");

ALTER TABLE "TrackLike" ADD CONSTRAINT "TrackLike_songId_fkey"
    FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackLike" ADD CONSTRAINT "TrackLike_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Marketplace filter helpers: queries like "WHERE isActive AND genre = ?"
-- and "WHERE isActive AND bpm BETWEEN ?" run against this index now.
CREATE INDEX "Song_isActive_genre_idx" ON "Song"("isActive", "genre");
CREATE INDEX "Song_isActive_bpm_idx" ON "Song"("isActive", "bpm");

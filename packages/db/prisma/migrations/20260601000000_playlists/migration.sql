-- Playlists: user-curated collections of songs with optional share-by-link.
--
-- Two tables:
--   Playlist        — header row owned by a user, with a public toggle and
--                     a rotatable shareToken for unguessable share links.
--   PlaylistTrack   — m2m join with float `position` for drag-reorder
--                     (insert-between without renumbering the whole list).
--
-- Loose foreign keys (no FK constraints) match SavedTrack/User patterns
-- already in the schema — Prisma application code handles cascading.

CREATE TABLE IF NOT EXISTS "Playlist" (
  "id"          TEXT NOT NULL,
  "ownerId"     TEXT NOT NULL,
  "name"        VARCHAR(120) NOT NULL,
  "description" TEXT,
  "coverUrl"    TEXT,
  "isPublic"    BOOLEAN NOT NULL DEFAULT false,
  "shareToken"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Playlist_shareToken_key"
  ON "Playlist" ("shareToken");

CREATE INDEX IF NOT EXISTS "Playlist_ownerId_updatedAt_idx"
  ON "Playlist" ("ownerId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Playlist_isPublic_updatedAt_idx"
  ON "Playlist" ("isPublic", "updatedAt");

CREATE TABLE IF NOT EXISTS "PlaylistTrack" (
  "id"         TEXT NOT NULL,
  "playlistId" TEXT NOT NULL,
  "songId"     TEXT NOT NULL,
  "position"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "addedById"  TEXT NOT NULL,

  CONSTRAINT "PlaylistTrack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_songId_key"
  ON "PlaylistTrack" ("playlistId", "songId");

CREATE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_position_idx"
  ON "PlaylistTrack" ("playlistId", "position");

CREATE INDEX IF NOT EXISTS "PlaylistTrack_songId_idx"
  ON "PlaylistTrack" ("songId");

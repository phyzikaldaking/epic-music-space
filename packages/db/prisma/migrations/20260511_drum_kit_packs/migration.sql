-- DrumKitPack: community-uploaded drum kit packs (#29).
-- Each pack is a JSON sample manifest the studio loads in one click.

CREATE TABLE "DrumKitPack" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "genre" VARCHAR(40),
  "bpm" INTEGER,
  "coverUrl" TEXT,
  "samples" JSONB NOT NULL,
  "priceUsd" DECIMAL(10, 2),
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DrumKitPack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DrumKitPack_isPublic_isFeatured_idx" ON "DrumKitPack"("isPublic", "isFeatured");
CREATE INDEX "DrumKitPack_authorId_idx" ON "DrumKitPack"("authorId");
CREATE INDEX "DrumKitPack_genre_idx" ON "DrumKitPack"("genre");

ALTER TABLE "DrumKitPack" ADD CONSTRAINT "DrumKitPack_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

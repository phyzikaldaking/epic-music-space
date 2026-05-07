-- Cinematic pro-profile fields for engineers/producers.
ALTER TABLE "User"
  ADD COLUMN "headline"           VARCHAR(160),
  ADD COLUMN "bioLong"             TEXT,
  ADD COLUMN "coverImage"          TEXT,
  ADD COLUMN "location"            VARCHAR(120),
  ADD COLUMN "websiteUrl"          TEXT,
  ADD COLUMN "instagramUrl"        TEXT,
  ADD COLUMN "twitterUrl"          TEXT,
  ADD COLUMN "youtubeUrl"          TEXT,
  ADD COLUMN "tiktokUrl"           TEXT,
  ADD COLUMN "spotifyUrl"          TEXT,
  ADD COLUMN "grammyNominations"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "grammyWins"          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "riaaPlatinum"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "riaaGold"            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "billboardNumberOne"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "engineerCredits"     JSONB,
  ADD COLUMN "engineerAccolades"   JSONB,
  ADD COLUMN "engineerGear"        JSONB,
  ADD COLUMN "yearsExperience"     INTEGER,
  ADD COLUMN "proProfilePublished" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_role_proProfilePublished_idx" ON "User" ("role", "proProfilePublished");

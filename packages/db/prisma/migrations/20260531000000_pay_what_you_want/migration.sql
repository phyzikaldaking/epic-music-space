-- Pay-what-you-want pricing on songs.
--
-- When payWhatYouWant=true, the existing `licensePrice` column is treated
-- as the *minimum* fans must pay; the actual amount captured at checkout
-- is whatever the fan picks at or above that floor. Existing rows default
-- to false so nothing about the catalog changes for current producers
-- until they opt in via the upload form.
--
-- Additive only: nullable not required (NOT NULL with DEFAULT false is
-- safe because the default fills every existing row).

ALTER TABLE "Song"
  ADD COLUMN IF NOT EXISTS "payWhatYouWant" BOOLEAN NOT NULL DEFAULT false;

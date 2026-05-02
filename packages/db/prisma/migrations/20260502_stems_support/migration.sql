-- Add stems/trackout delivery fields to Song
ALTER TABLE "Song" ADD COLUMN "stemUrl"   TEXT;
ALTER TABLE "Song" ADD COLUMN "stemFiles" JSONB;
ALTER TABLE "Song" ADD COLUMN "hasStems"  BOOLEAN NOT NULL DEFAULT false;

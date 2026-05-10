-- Add auto-credit metadata to Song (#30). Capture which beat kit /
-- template / contributors were used at publish time so the track page
-- can surface attribution and producers earn visible credit.

ALTER TABLE "Song" ADD COLUMN "credits" JSONB;

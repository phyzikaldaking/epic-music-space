-- Add version-history snapshots for StudioProject (#20).
-- Also adds isTemplate / templateGenre fields used by Save-as-template (#22).

ALTER TABLE "StudioProject" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudioProject" ADD COLUMN "templateGenre" TEXT;

CREATE TABLE "StudioProjectVersion" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "patternJson" JSONB NOT NULL,
  "bpm" INTEGER NOT NULL DEFAULT 120,
  "trackCount" INTEGER NOT NULL DEFAULT 0,
  "label" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioProjectVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioProjectVersion_projectId_createdAt_idx" ON "StudioProjectVersion"("projectId", "createdAt");

ALTER TABLE "StudioProjectVersion" ADD CONSTRAINT "StudioProjectVersion_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "StudioProject_isTemplate_idx" ON "StudioProject"("isTemplate");

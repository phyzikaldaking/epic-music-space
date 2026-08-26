-- Artist Rights Center persistence
CREATE TABLE "RightsSong" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "artistName" TEXT,
  "isrc" TEXT,
  "upc" TEXT,
  "ipi" TEXT,
  "cae" TEXT,
  "releaseDate" TIMESTAMP(3),
  "territory" TEXT,
  "rights" JSONB NOT NULL DEFAULT '[]',
  "writers" JSONB NOT NULL DEFAULT '[]',
  "licenseChecklist" JSONB NOT NULL DEFAULT '{}',
  "registrationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RightsSong_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RightsDocument" (
  "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "songId" TEXT, "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "storageBucket" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL, "encryptionVersion" TEXT NOT NULL, "checksum" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RightsDocument_pkey" PRIMARY KEY ("id")
);
CREATE TYPE "RightsReviewStatus" AS ENUM ('PENDING','IN_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED');
CREATE TABLE "RightsReview" (
  "id" TEXT NOT NULL, "requesterId" TEXT NOT NULL, "songId" TEXT, "status" "RightsReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerId" TEXT, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" TIMESTAMP(3),
  "notes" TEXT, CONSTRAINT "RightsReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RightsReminder" (
  "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "songId" TEXT, "title" TEXT NOT NULL, "dueAt" TIMESTAMP(3) NOT NULL,
  "provider" TEXT, "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RightsReminder_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "RightsSong" ADD CONSTRAINT "RightsSong_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RightsDocument" ADD CONSTRAINT "RightsDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RightsDocument" ADD CONSTRAINT "RightsDocument_songId_fkey" FOREIGN KEY ("songId") REFERENCES "RightsSong"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RightsReview" ADD CONSTRAINT "RightsReview_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RightsReview" ADD CONSTRAINT "RightsReview_songId_fkey" FOREIGN KEY ("songId") REFERENCES "RightsSong"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RightsReminder" ADD CONSTRAINT "RightsReminder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RightsReminder" ADD CONSTRAINT "RightsReminder_songId_fkey" FOREIGN KEY ("songId") REFERENCES "RightsSong"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "RightsSong_ownerId_updatedAt_idx" ON "RightsSong"("ownerId","updatedAt");
CREATE INDEX "RightsSong_ownerId_title_idx" ON "RightsSong"("ownerId","title");
CREATE INDEX "RightsSong_isrc_idx" ON "RightsSong"("isrc");
CREATE INDEX "RightsDocument_ownerId_createdAt_idx" ON "RightsDocument"("ownerId","createdAt");
CREATE INDEX "RightsDocument_songId_idx" ON "RightsDocument"("songId");
CREATE INDEX "RightsReview_requesterId_status_idx" ON "RightsReview"("requesterId","status");
CREATE INDEX "RightsReview_songId_status_idx" ON "RightsReview"("songId","status");
CREATE INDEX "RightsReminder_ownerId_dueAt_idx" ON "RightsReminder"("ownerId","dueAt");

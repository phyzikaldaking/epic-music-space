CREATE TYPE "RoomNoteCategory" AS ENUM ('GENERAL','MIX','MASTER','SONGWRITING','ARRANGEMENT','PERFORMANCE');

ALTER TABLE "Room"
  ADD COLUMN "autoQueueEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "quietMode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "speakerLimitSec" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "RoomTimelineNote"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "category" "RoomNoteCategory" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedById" TEXT;

CREATE INDEX "RoomTimelineNote_roomId_parentId_createdAt_idx" ON "RoomTimelineNote"("roomId", "parentId", "createdAt");

ALTER TABLE "RoomTimelineNote"
  ADD CONSTRAINT "RoomTimelineNote_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "RoomTimelineNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

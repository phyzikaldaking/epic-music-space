-- Room studio state + timeline notes
CREATE TYPE "RoomSessionMode" AS ENUM ('PLAYBACK', 'CRITIQUE', 'A_AND_R', 'SILENT_NOTES');
CREATE TYPE "RoomStudioVibe" AS ENUM ('NEON', 'SUNSET', 'MIDNIGHT');

ALTER TABLE "Room"
  ADD COLUMN "sessionMode" "RoomSessionMode" NOT NULL DEFAULT 'PLAYBACK',
  ADD COLUMN "studioVibe" "RoomStudioVibe" NOT NULL DEFAULT 'NEON',
  ADD COLUMN "spotlightUserId" TEXT,
  ADD COLUMN "crowdEnergy" INTEGER NOT NULL DEFAULT 42,
  ADD COLUMN "applauseBursts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "heatPoints" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "RoomTimelineNote" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "atSeconds" INTEGER NOT NULL DEFAULT 0,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomTimelineNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoomTimelineNote_roomId_createdAt_idx" ON "RoomTimelineNote"("roomId", "createdAt");

ALTER TABLE "RoomTimelineNote"
  ADD CONSTRAINT "RoomTimelineNote_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoomTimelineNote"
  ADD CONSTRAINT "RoomTimelineNote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

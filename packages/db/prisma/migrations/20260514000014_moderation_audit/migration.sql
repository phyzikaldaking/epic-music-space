CREATE TABLE IF NOT EXISTS "ModerationAction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reportId" TEXT,
    "postId" TEXT,
    "subjectUserId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ModerationAction_actorId_createdAt_idx"
    ON "ModerationAction"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "ModerationAction_reportId_idx" ON "ModerationAction"("reportId");
CREATE INDEX IF NOT EXISTS "ModerationAction_postId_idx" ON "ModerationAction"("postId");
CREATE INDEX IF NOT EXISTS "ModerationAction_subjectUserId_idx" ON "ModerationAction"("subjectUserId");
CREATE INDEX IF NOT EXISTS "ModerationAction_action_createdAt_idx"
    ON "ModerationAction"("action", "createdAt");

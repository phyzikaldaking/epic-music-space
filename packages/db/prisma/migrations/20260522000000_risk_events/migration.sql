CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "songId" TEXT,
    "reportId" TEXT,
    "transactionId" TEXT,
    "ipHash" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RiskEvent_eventType_createdAt_idx" ON "RiskEvent"("eventType", "createdAt");
CREATE INDEX "RiskEvent_severity_createdAt_idx" ON "RiskEvent"("severity", "createdAt");
CREATE INDEX "RiskEvent_status_createdAt_idx" ON "RiskEvent"("status", "createdAt");
CREATE INDEX "RiskEvent_actorUserId_createdAt_idx" ON "RiskEvent"("actorUserId", "createdAt");
CREATE INDEX "RiskEvent_targetUserId_createdAt_idx" ON "RiskEvent"("targetUserId", "createdAt");
CREATE INDEX "RiskEvent_songId_createdAt_idx" ON "RiskEvent"("songId", "createdAt");
CREATE INDEX "RiskEvent_createdAt_idx" ON "RiskEvent"("createdAt");

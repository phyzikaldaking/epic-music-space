-- CreateTable
CREATE TABLE "EmailDripSent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDripSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDripSent_userId_step_key" ON "EmailDripSent"("userId", "step");
CREATE INDEX "EmailDripSent_sentAt_idx" ON "EmailDripSent"("sentAt");

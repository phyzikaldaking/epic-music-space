-- Migration: add_push_tokens_and_telemetry
-- Adds PushToken and NativeTelemetryEvent tables for the native mobile shell.

-- ─────────────────────────────────────────────────────────────
-- PushToken: one row per device per user
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "PushToken" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "platform"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- unique constraint so upsert by token is safe
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- index for looking up tokens by user
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- cascade-delete tokens when the user is deleted
ALTER TABLE "PushToken"
    ADD CONSTRAINT "PushToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- NativeTelemetryEvent: daily session ping from the native shell
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "NativeTelemetryEvent" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT,
    "platform"   TEXT NOT NULL,
    "osVersion"  TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "appBuild"   TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NativeTelemetryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NativeTelemetryEvent_createdAt_idx" ON "NativeTelemetryEvent"("createdAt");
CREATE INDEX "NativeTelemetryEvent_userId_idx"    ON "NativeTelemetryEvent"("userId");

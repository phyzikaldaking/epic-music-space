-- Durable forensic trail for auth events.
-- IF NOT EXISTS guards keep this safe to re-run on environments that may
-- already have a partial table from earlier ad-hoc bootstrapping.

CREATE TABLE IF NOT EXISTS "AuthEvent" (
    "id"          TEXT NOT NULL,
    "event"       TEXT NOT NULL,
    "userId"      TEXT,
    "emailMasked" TEXT,
    "ipHash"      TEXT,
    "userAgent"   TEXT,
    "reason"      TEXT,
    "meta"        JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuthEvent_event_createdAt_idx"
    ON "AuthEvent" ("event", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthEvent_userId_createdAt_idx"
    ON "AuthEvent" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthEvent_createdAt_idx"
    ON "AuthEvent" ("createdAt");

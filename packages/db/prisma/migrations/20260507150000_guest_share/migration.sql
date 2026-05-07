-- GuestShare: anonymous /studio/try WAV uploads with public listen tokens.
CREATE TABLE "GuestShare" (
  "id"          TEXT PRIMARY KEY,
  "token"       TEXT NOT NULL,
  "audioUrl"    TEXT NOT NULL,
  "fileName"    TEXT NOT NULL,
  "ipHash"      TEXT,
  "listenCount" INTEGER NOT NULL DEFAULT 0,
  "durationSec" INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "GuestShare_token_key" ON "GuestShare" ("token");
CREATE INDEX "GuestShare_expiresAt_idx"  ON "GuestShare" ("expiresAt");
CREATE INDEX "GuestShare_createdAt_idx"  ON "GuestShare" ("createdAt");

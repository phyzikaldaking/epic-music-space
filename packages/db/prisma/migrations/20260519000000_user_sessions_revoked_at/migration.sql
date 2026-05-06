-- Adds the session-revocation marker so JWT-strategy sessions can be
-- invalidated server-side. JWTs issued before this timestamp are
-- treated as signed-out by the auth session callback. Set whenever we
-- want every existing session for the user to die: password reset,
-- account suspension, admin-forced sign-out.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-running is a no-op.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionsRevokedAt" TIMESTAMP(3);

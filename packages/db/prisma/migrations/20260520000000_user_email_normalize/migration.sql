-- Audit nit #24. The application normalizes every email to lowercase
-- before insert (lib/authIdentity.ts > normalizeEmail) and looks up
-- with `mode: "insensitive"`, but historic rows from before
-- normalization rolled out can still hold mixed-case values. That
-- meant a sign-in attempt for "User@Example.com" matched the row
-- via the case-insensitive find, but the registration unique
-- constraint (raw "email") would happily allow a second row at
-- "user@example.com". Two effective accounts; one collision waiting.
--
-- Fix:
--   1. Lowercase every existing User.email so the data matches what
--      the app writes today.
--   2. Add a functional UNIQUE index on LOWER(email) so future
--      mixed-case attempts collide at the DB level too. The
--      schema-level @unique on `email` is already lowercase-only
--      after the backfill — the functional index is the belt + braces.
--
-- The UPDATE is wrapped in a guard so re-running is a no-op (no rows
-- have any uppercase characters to fix on a second run). The CREATE
-- INDEX uses IF NOT EXISTS for the same reason.

-- Step 1: backfill mixed-case rows. Skipped automatically when none
-- remain.
UPDATE "User"
   SET "email" = LOWER("email")
 WHERE "email" <> LOWER("email");

-- Step 2: belt + braces unique index on LOWER(email). The existing
-- schema-level @unique on the raw "email" column stays in place —
-- this index hardens the constraint against any future writer that
-- bypasses the application's normalizeEmail() call.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_unique"
  ON "User" (LOWER("email"));

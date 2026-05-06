-- Promote "VerzuzMatch"."status" from TEXT to a proper enum type to match
-- the Prisma schema. The 20260515100000_verzuz_battles migration shipped
-- it as TEXT; the schema later changed to `enum VerzuzStatus { SCHEDULED,
-- LIVE, COMPLETED }`, but no migration ever created the type — so prod
-- has been throwing 42704 ("type public.VerzuzStatus does not exist") on
-- every /verzuz read and every advance-verzuz cron tick.
--
-- Idempotent + safe to re-run. Uses guarded CREATE TYPE and only alters
-- the column when its current type is still TEXT.

DO $$ BEGIN
  CREATE TYPE "VerzuzStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'VerzuzMatch'
     AND column_name = 'status';

  IF current_type = 'text' THEN
    -- Drop and re-add the default so Postgres doesn't reject the cast.
    ALTER TABLE "VerzuzMatch" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "VerzuzMatch"
      ALTER COLUMN "status" TYPE "VerzuzStatus"
      USING "status"::"VerzuzStatus";
    ALTER TABLE "VerzuzMatch"
      ALTER COLUMN "status" SET DEFAULT 'SCHEDULED'::"VerzuzStatus";
  END IF;
END $$;

# Backup / restore drill

A backup that has never been restored is not a backup. Run this drill
**quarterly** or whenever the schema changes materially. Calendar reminder
beats good intentions.

## Goals

1. Confirm a usable backup exists for the production database.
2. Confirm we can restore it into an isolated environment within
   **2 hours** (our self-imposed RTO — adjust if reality is worse).
3. Confirm the restored database is *queryable*, not just bit-identical.
4. Capture the actual elapsed time so the runbook stays honest.

## Pre-flight

- [ ] Two engineers participating. One drives, one observes — restoring a
      production backup against the wrong target is the textbook way to lose
      data, and a second pair of eyes pays for itself the first time.
- [ ] Pick a non-production target. Either a **fresh ephemeral DB** in the
      same provider (Supabase branch, RDS instance, Neon branch, etc.) or a
      local Postgres instance. Never restore over `staging` if `staging` is
      shared with anyone else's work.
- [ ] Decide the backup snapshot age. Use the **most recent successful**
      automated backup. If the provider only retains daily, that's fine —
      but the drill is meaningless if you only ever test fresh backups.

## Procedure

### 1. Identify the snapshot
```bash
# Provider-specific. Examples:

# Supabase
supabase db backups list --project-ref $PROJECT_REF

# RDS
aws rds describe-db-snapshots --db-instance-identifier ems-prod \
  --query 'DBSnapshots[?SnapshotType==`automated`] | reverse(sort_by(@, &SnapshotCreateTime))[0]'

# Neon
neon branches list --project-id $PROJECT_ID
```

Record: snapshot ID, age, size on disk.

### 2. Provision the target
- Same provider, isolated. Tag with `purpose=drill` so it's obvious in the
  console and easy to delete later.
- Note the connection string. **Don't commit it.**

### 3. Restore
```bash
# Provider-specific examples — pick the one that matches.

# Supabase — restore into a branch
supabase db restore --project-ref $TARGET --backup-id $BACKUP_ID

# RDS
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier ems-drill-$(date +%Y%m%d) \
  --db-snapshot-identifier $SNAPSHOT_ID \
  --db-instance-class db.t4g.medium

# Local pg_restore from a logical dump
pg_restore --clean --if-exists --no-owner --no-privileges \
  -h localhost -U postgres -d ems_drill backup.dump
```

Start a stopwatch when the restore begins. Stop when the target is
accepting queries.

### 4. Verify integrity (queries, not just connectivity)

```sql
-- 1. Schema looks right
\dt

-- 2. Recent data made it in (these tables exist and are exercised
--    most often, so a fresh-enough backup will have entries from
--    the last hour or two).
SELECT max("createdAt") AS last_user FROM "User";
SELECT max("createdAt") AS last_song FROM "Song";
SELECT max("createdAt") AS last_tx   FROM "Transaction";
SELECT max("createdAt") AS last_pay  FROM "Payout";

-- 3. Foreign keys still resolve (this query throws if a referenced
--    column was lost during restore).
SELECT count(*) FROM "RevenueSplit"
JOIN "RevenueEvent" ON "RevenueEvent".id = "RevenueSplit"."eventId"
LIMIT 1;

-- 4. The Prisma migration history matches what we expect to see in
--    the codebase. Look for the most recent migration name.
SELECT migration_name, finished_at FROM "_prisma_migrations"
ORDER BY finished_at DESC LIMIT 5;
```

Expected: every query returns a sensible result without error. Any failure
goes in the report.

### 5. Run the smoke suite against the restored DB

```bash
# Point Prisma at the restored DB and run the focused tests
DATABASE_URL=$RESTORED_DB_URL npm --workspace apps/web run test:e2e
```

The suite hits the data layer through real Prisma calls, so a corrupted
foreign key or missing index will surface here.

### 6. Tear down
- Delete the drill database.
- Revoke any temporary credentials minted for the drill.

## Capture the result

Append to `docs/drill-log.md` with:
- Date
- Snapshot ID + age
- Restore time (start → queryable)
- Smoke test result
- Anyone who participated
- What broke (or "nothing")

If restore time was over 2 hours: file a Linear ticket to investigate
**before** the next drill. RTO regression is the #1 thing this drill
exists to catch.

## What NOT to do

- Don't restore over the production DB. Even with `--target staging`, a
  typo'd flag has restored a dev backup over prod before. Verify the target
  twice.
- Don't run the drill against a stale snapshot you happened to have lying
  around. Use the most recent automated backup — that's what you'll actually
  reach for in an incident.
- Don't skip the verification queries. A backup that "restores cleanly" but
  is missing recent data is worse than no backup, because you'll trust it.
- Don't keep the drill database around "in case." It's a privileged copy of
  production data with no audit log; delete it the same day.

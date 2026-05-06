# Database failover / Postgres unhealthy

## Signals
- `/api/health/full` reporting `db: unhealthy`
- Prisma errors: `P1001` (can't reach), `P1008` (timeout), `P2024` (connection pool exhausted)
- Spike in 5xx across all routes — DB is on the critical path for almost everything
- `recordPayoutFailure` rows piling up

## Triage
1. Check `/admin/status` — gives DB connectivity at a glance.
2. Check the DB provider dashboard (RDS / Supabase / whatever's wired to `DATABASE_URL`).
3. Run a low-cost probe to distinguish "DB down" from "connection pool exhausted":
   ```bash
   psql "$DATABASE_URL" -c "select 1"
   ```
   - If it returns instantly → pool exhaustion in the app, not the DB.
   - If it hangs → infrastructure problem.

## Recovery — pool exhaustion
- Restart the affected service (Vercel: redeploy; workers: roll the worker fleet).
- Check for leaked connections — long-running queries from the admin panel or analytics jobs are common culprits.
- If a slow query is the cause, kill it:
  ```sql
  SELECT pid, query, state, age(now(), query_start) AS dur
  FROM pg_stat_activity
  WHERE state = 'active' ORDER BY dur DESC LIMIT 20;
  -- pg_terminate_backend(<pid>);
  ```

## Recovery — primary down (managed failover)
- Most providers fail over automatically. Wait 1–3 min, then check
  `/api/health/full` again.
- If `DATABASE_URL` is hardcoded to the primary and didn't move, update the
  Vercel env to the failover endpoint and redeploy.
- The payout cron uses `pg_try_advisory_lock` — a fresh primary clears the
  lock automatically, so the next scheduled run will resume cleanly.

## Recovery — corruption / data loss
**STOP. DO NOT TRY TO FIX UNDER PRESSURE.**
- Snapshot the database NOW (provider console).
- Page the second on-call.
- Decide between point-in-time-restore vs forward-fix in a quiet room. PITR
  loses minutes-to-hours of data; partial forward-fix may be unrecoverable.

## What NOT to do
- Do not run `prisma migrate deploy` against a degraded primary.
- Do not `prisma db push` against production — schema changes go through
  migrations only.
- Do not clear `pg_locks` manually unless you know the specific advisory key.
  The payout lock prevents double-paying creators.

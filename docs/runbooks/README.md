# EMS Incident Runbooks

Each runbook is short on purpose. The goal is one screen of "what to look at,
what to do, what NOT to do" for the on-call. Update them when the system
changes.

| Scenario | File |
| --- | --- |
| Stripe outage / payments degraded | [stripe-down.md](./stripe-down.md) |
| Database failover / Postgres unhealthy | [db-failover.md](./db-failover.md) |
| BullMQ queue backed up | [queue-backed-up.md](./queue-backed-up.md) |
| OAuth provider (Google/GitHub) down | [oauth-down.md](./oauth-down.md) |
| Vercel / CDN edge issue | [cdn-edge-issue.md](./cdn-edge-issue.md) |
| Stream / audio playback broken | [streaming-broken.md](./streaming-broken.md) |
| Suspected fraud / abuse spike | [fraud-spike.md](./fraud-spike.md) |

## First five minutes — universal

1. Open `/admin/status` and `/api/health/full`. They paint the system in one
   view (DB, Redis, Stripe, queues, recent errors).
2. Check Sentry for new error groups in the last 30 minutes. Filter by
   `release:` to scope to the current deploy.
3. Check the latest deployment in Vercel — if the spike correlates with a
   deploy, **rollback first, investigate second**. `vercel rollback` against
   the production project is one command.
4. Post in `#incidents` with: what's broken, what you've tried, ETA. Even a
   sentence is better than silence — it stops other people debugging blind.

## What NOT to do

- **Don't `--force-push` to main.** Roll forward with a fix or roll back the
  deployment.
- **Don't disable the Stripe webhook signature check** to "make payments work
  again." Idempotent retries handle real outages; an unsigned endpoint is a
  permanent foot-gun.
- **Don't `npm install --force` in prod.** If a package is broken, rollback
  and investigate locally.
- **Don't drop tables to clear a stuck migration.** Snapshot first, ask in
  `#incidents`. There is almost always a path that doesn't lose data.

# Production Migration and Restore Runbook

## Purpose

Use this before every production schema change and once per quarter as a restore drill.

## Migration deploy

1. Confirm the release branch has passed `npm run build:web`, `npm run perf:budget`, and web/API tests.
2. Confirm `DATABASE_URL` points at the pooled runtime URL and `DIRECT_URL` points at the direct migration URL.
3. Run a fresh backup in the database provider dashboard.
4. Deploy migrations:

```bash
DIRECT_URL="$DIRECT_URL" DATABASE_URL="$DATABASE_URL" npm --workspace packages/db run db:deploy
```

5. Verify:

```bash
SYNTHETICS_BASE_URL=https://epicmusicspace.com npm run reliability:smoke
SYNTHETICS_BASE_URL=https://epicmusicspace.com npm run reliability:auth-smoke
```

6. Open `/admin/ops` and confirm readiness is `ok`, Redis is configured, DB latency is normal, and queue backlog is stable.
7. Confirm demo content is not enabled in production unless intentionally running a launch demo: `ENABLE_DEMO_CONTENT` and `NEXT_PUBLIC_ENABLE_DEMO_CONTENT` should be unset or `false`.

## Restore drill

1. Restore the latest backup into a temporary database.
2. Run `prisma migrate deploy` against the restored DB.
3. Start a preview deployment with the restored DB credentials.
4. Smoke test signup, login, marketplace, upload URL generation, Stripe webhook test payload, and `/admin/risk`.
5. Record restore time and data freshness in the incident log.

## Rollback

If migration deploy causes 5xx, payment failures, or DB errors:

1. Stop traffic promotion.
2. Roll back the app alias to the last stable deployment.
3. If schema is destructive, restore from the backup created before deploy.
4. Create or update a public status incident if user-facing flows are affected.

# Stripe key rotation + checkout freeze runbook

This runbook rotates `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` with a safe checkout pause.

## 1) Freeze checkout

Set this in Doppler (prod first), then sync:

- `CHECKOUT_MAINTENANCE_MODE=true`
- Optional: `CHECKOUT_MAINTENANCE_MESSAGE=...`

Sync to Vercel + GitHub:

```bash
npm run env:push:prod
```

## 2) Capture baseline health

```bash
curl -sS "$NEXT_PUBLIC_SITE_URL/api/health/stripe"
```

Also validate local env shape:

```bash
npm run env:check
```

## 3) Rotate in Stripe dashboard

1. Create/reveal new live secret key.
2. Rotate webhook endpoint signing secret for production webhook endpoint.
3. Keep old secrets active during cutover only.

## 4) Update Doppler

Update all three configs in order:

1. `prod`
2. `preview`
3. `dev`

Keys:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## 5) Propagate secrets

```bash
npm run env:push:prod
npm run env:push:preview
npm run env:pull
```

## 6) Validate before unfreeze

1. `GET /api/health/stripe` returns `ok` or `degraded` with no config errors.
2. Checkout session creation succeeds from a live endpoint.
3. Webhook signature verification succeeds (use Stripe event replay if needed).

## 7) Re-enable checkout

Set `CHECKOUT_MAINTENANCE_MODE=false` in Doppler and push again:

```bash
npm run env:push:prod
```

## 8) Post-cutover cleanup

1. Revoke old secret key and old webhook secret in Stripe dashboard.
2. Check for stuck pending transactions:

```sql
SELECT id, "userId", amount, status, "createdAt"
FROM "Transaction"
WHERE status = 'PENDING'
  AND "stripeSessionId" IS NOT NULL
  AND "createdAt" < now() - interval '30 minutes'
ORDER BY "createdAt" DESC
LIMIT 50;
```

3. Record timestamp + rotated key IDs in ops notes (never record secret values).

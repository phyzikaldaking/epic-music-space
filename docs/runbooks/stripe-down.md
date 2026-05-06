# Stripe outage / payments degraded

## Signals
- Spike in `payment_intent.payment_failed` or 5xx from `/api/webhooks/stripe`
- `[stripe-webhook] FRAUD_ALERT refund_rate` in logs (false positive when Stripe is itself failing)
- `processPayoutsForUser` returning `FAILED` with `stripe account unavailable`
- Stripe status page: https://status.stripe.com

## Triage
1. Confirm scope: is it our webhook (signature/network) or all of Stripe?
   - Check `https://status.stripe.com` first — if Stripe is down, sit tight and watch.
   - If only our webhook is failing: check `getStripeWebhookSecret()` against the Stripe Dashboard (rotation? wrong env var?).
2. Verify the dedupe table is healthy:
   ```sql
   SELECT count(*), max("createdAt") FROM "ProcessedWebhook" WHERE source = 'stripe' AND "createdAt" > now() - interval '1 hour';
   ```
3. Check transaction state — anything stuck in `PENDING` longer than 30 min that has a `stripeSessionId` is suspicious:
   ```sql
   SELECT id, "userId", amount, status, "createdAt"
   FROM "Transaction"
   WHERE status = 'PENDING' AND "stripeSessionId" IS NOT NULL AND "createdAt" < now() - interval '30 minutes'
   ORDER BY "createdAt" DESC LIMIT 50;
   ```

## Recovery
- **Stripe is up, our webhook is down**: redeploy or rollback. Stripe will
  retry delivery for 3 days, so dropped events will replay automatically once
  the endpoint returns 2xx.
- **Stripe is down**: do nothing destructive. Checkout sessions that fail
  client-side recover on retry — users see a friendly retry screen. Pending
  transactions auto-FAIL when the session expires (`checkout.session.expired`
  is handled).
- **Webhook signature errors**: rotate `STRIPE_WEBHOOK_SECRET` in Vercel,
  redeploy, replay missed events from the Stripe Dashboard.

## What NOT to do
- Do not disable signature verification in `app/api/webhooks/stripe/route.ts`.
- Do not manually flip `Transaction.status = 'SUCCEEDED'` without verifying
  the corresponding `Payout` and `RevenueSplit` rows exist — license
  reservation logic in `handleLicenseCheckoutCompleted` is the source of truth.
- Do not retry a `stripe.transfers.create` without an `idempotencyKey` —
  duplicates equal duplicate payouts and a clawback nightmare.

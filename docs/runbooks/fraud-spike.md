# Suspected fraud / abuse spike

## Signals
- `[stripe-webhook] FRAUD_ALERT refund_rate` slack ping
- Surge in `RiskEvent` rows (`fake_play`, `failed_payment`, `signup_burst`)
- `payoutRiskScore` ≥ 60 across many users in one cycle (holdback rate ramps)
- New accounts signing up from a single ASN / region in minutes

## Triage
1. Pull the last hour of risk activity:
   ```sql
   SELECT "eventType", severity, COUNT(*) AS n
   FROM "RiskEvent"
   WHERE "createdAt" > now() - interval '1 hour'
   GROUP BY 1, 2 ORDER BY n DESC;
   ```
2. Look for clusters by IP, songId, or actorUserId — the metadata column
   captures all three for the most common event types.
3. Compare against baseline. A 2× hourly spike is suspicious; a 10× spike is
   probably real.

## Recovery — coordinated stream botnet
Per-(song, ip) bursts already get excluded from payout calculations
(`buildHoldbackPlan` in `payouts.ts` weights stream share into the holdback
target). To raise the bar manually for a 24-hour window:
- Lower the burst thresholds in `app/api/songs/[id]/stream/route.ts`
  (`minuteHits > 15`, `dayHits > 120`).
- For an ongoing attack, pause stream royalty accrual: set
  `STREAM_ROYALTY_CENTS_PER_PLAY=0` in Vercel env. Plays still count, but no
  ledger row is created. Restore the value after the attack is investigated.

## Recovery — payment fraud
Failed-payment risk events with HIGH severity (≥ $500) flow into payout
holdback automatically. Stripe Radar handles the front line — escalate to
Stripe via the Dashboard for the offending PaymentIntent. Do not refund
manually before checking with Stripe; some refunds are themselves the fraud
(refund-and-rebuy schemes).

## Recovery — signup farm
- Confirm via PostHog: how many sessions per IP/UA in the last hour?
- Increase `botid` confidence threshold in `botCheck.ts` for the affected
  routes. The library is already wired into `/api/auth/register`.
- Temporarily require email verification before any state-changing action
  (search for `requireEmailVerified` if/when added — may be a real next gap
  if the attack is sophisticated).

## What NOT to do
- Do not blanket-ban entire ASNs. Many legitimate users sit behind cloud
  egress (corporate VPN, cellular carrier-grade NAT).
- Do not retroactively delete `RevenueSplit` rows — payouts to legitimate
  users are derived from these. Use the holdback mechanism (`heldSplitIds`)
  which is reversible.
- Do not disable rate limiting "to clear the queue." The 429s are working as
  designed.

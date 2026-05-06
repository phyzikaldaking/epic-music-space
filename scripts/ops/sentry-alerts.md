# Sentry alert rules — EMS

Sentry alert rules can be created via the API or imported manually from the
Sentry UI. The rules below are the minimum set we want for production. Each
rule is keyed by a stable name so re-running setup is idempotent.

## One-shot setup

```bash
# Requires SENTRY_AUTH_TOKEN with project:write scope
export SENTRY_AUTH_TOKEN=...
export SENTRY_ORG=epic-music-space
export SENTRY_PROJECT=web
node scripts/ops/sentry-alerts.mjs
```

## Rules

### 1. Spike: error event volume

| Field | Value |
| --- | --- |
| Name | `EMS · error spike (5×)` |
| Trigger | `event.type:error` count is **5× the 7-day average** in any 5-minute window |
| Action | Slack `#alerts` + page on-call (PagerDuty severity: error) |
| Reason | A deploy-induced regression usually shows up as a 5–10× count spike within minutes. Tighter than 5× over-pages on normal user-error growth. |

### 2. Critical: unhandled in `/api/webhooks/stripe`

| Field | Value |
| --- | --- |
| Name | `EMS · stripe-webhook unhandled` |
| Trigger | `event.type:error` and `transaction:/api/webhooks/stripe` count **> 0** in 1 minute |
| Action | Page on-call (PD severity: critical) |
| Reason | Stripe retries for 3 days, but every failed delivery is a customer in limbo. Single occurrence pages because the dedup is downstream. |

### 3. Warn: payout failure burst

| Field | Value |
| --- | --- |
| Name | `EMS · payout failures > 3 / hour` |
| Trigger | Custom metric `payouts.failed` count **> 3** in 1 hour |
| Action | Slack `#payouts` |
| Reason | Individual payout failures are expected (Stripe Connect lag, expired tokens). 3+ per hour is a cluster — usually a config rotation that broke our service. |

### 4. Warn: queue depth

| Field | Value |
| --- | --- |
| Name | `EMS · queue depth > 5000` |
| Trigger | Custom metric `bullmq.waiting` **> 5000** for 10 minutes |
| Action | Slack `#alerts` |
| Reason | Notifications and emails are user-facing. Five-minute lag is invisible; 10+ min crosses the perceptible threshold. |

### 5. SLO: API p95 latency

| Field | Value |
| --- | --- |
| Name | `EMS · API p95 > 1.5s` |
| Trigger | `transaction.duration p95` over 15 min on `op:http.server` exceeds 1500ms for 3 consecutive periods |
| Action | Slack `#alerts` |
| Reason | Sustained p95 > 1.5s correlates with abandonment. Three consecutive periods filters out one-off cold-start spikes. |

### 6. SLO: error rate

| Field | Value |
| --- | --- |
| Name | `EMS · 5xx rate > 1%` |
| Trigger | `http.status_code:5xx` rate over 5 min > 1% |
| Action | Slack `#alerts` + page on-call after 15 min sustained |
| Reason | The 1% threshold matches our SLA. The 15-min sustain on paging avoids waking on-call for transient infra blips. |

## Notes

- All rules apply to **production** environment only. Staging fires the same
  rules to a `#alerts-staging` channel without paging anyone.
- The `transaction:` filter relies on Sentry receiving traces. Confirm
  `tracesSampleRate > 0` in `sentry.server.config.ts` before relying on rule 5.
- Custom metrics (`payouts.failed`, `bullmq.waiting`) need to be emitted from
  the app via `Sentry.metrics.increment()` / `Sentry.metrics.gauge()` —
  wiring not in place yet. **Action item**: add metrics to `lib/payouts.ts`
  and the worker startup to populate rules 3 and 4.

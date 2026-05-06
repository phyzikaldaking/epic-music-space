# Risk Desk Runbook

## Signals

Risk events are written to `RiskEvent` and visible at `/admin/risk`.

Tracked event types:

- `suspicious_signup`
- `fake_play`
- `fake_vote`
- `failed_payment`
- `content_report`

Medium and higher events automatically increase `User.suspicionScore`. High and critical events flag the account.

## Operator actions

- **Dismiss**: false positive or resolved without action.
- **Escalate**: needs deeper investigation; severity is raised to high.
- **Flag**: increases user suspicion and marks `flaggedAt`.
- **Suspend**: blocks sensitive actions, revokes sessions, and records `suspendedReason`.

## Fake stream spike

1. Open `/admin/risk` and filter mentally for `fake_play`.
2. Check affected `songId` and repeated IP hash patterns.
3. Flag the account if the same actor/target repeats.
4. Suspend only when there is clear automation or payout manipulation.
5. Open `/admin/ops` and confirm queue backlog and DB latency are stable.

## Vote raid

1. Look for `fake_vote` events.
2. Compare affected match IDs in event metadata.
3. If a match is being attacked, pause promotion and escalate.
4. If one account or account cluster is responsible, flag or suspend.

## Failed payment spike

1. Look for `failed_payment`.
2. Check Stripe dashboard for card declines, Radar rules, or provider incident.
3. If failure rate is platform-wide, create an incident.
4. If actor-specific, flag for checkout review.

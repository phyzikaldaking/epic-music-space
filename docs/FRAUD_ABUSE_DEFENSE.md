# Fraud & Abuse Defense Layer

This document describes the checkout-focused fraud and abuse protections.

## Scope

The defense layer protects high-risk money flows by combining:

- Risk scoring from account and behavior signals
- Checkout amount limits for high-value purchases
- Hard blocks for suspended accounts
- Shared enforcement in payment-sensitive paths

## Risk Signals

Risk score computation is implemented in apps/web/src/lib/riskScore.ts.

Signals:

- New account age
- Email verification status
- Admin suspicion score
- Admin flagged state
- Recent transaction velocity
- Historical payout failures
- Optional checkout amount context

## Environment Configuration

The following env vars control thresholds:

- RISK_THRESHOLD_MEDIUM (default: 30)
- RISK_THRESHOLD_HIGH (default: 60)
- RISK_THRESHOLD_HARD (default: 80)
- RISK_MAX_CHECKOUT_USD (default: 500)

## Checkout Enforcement

License checkout enforces risk evaluation in apps/web/src/lib/payments/licenseCheckout.ts:

- Computes checkout USD value from license price x quantity
- Calls computeRiskScore(userId, { action: "CHECKOUT", checkoutAmountUsd })
- Blocks when verdict is HIGH or hard-blocked
- Blocks when checkout exceeds RISK_MAX_CHECKOUT_USD

## Testing

Coverage added in apps/web/src/lib/__tests__/licenseCheckout.test.ts:

- Successful checkout flow still works for LOW-risk users
- Fraud-layer blocks HIGH-risk checkout attempts before Stripe session creation

## Operations Notes

Recommended production posture:

- Start with conservative defaults and tune with observed false positives
- Alert on repeated blocked checkout attempts per user/IP
- Pair this layer with route-level rate limits and step-up verification for very large transactions

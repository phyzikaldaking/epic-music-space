# Checkout Incident Ops Pack

## Linear Incident Chain

Create these issues in order (same project, linked by blockers):

1. `INC-1 Stripe rotation + freeze gate`
2. `INC-2 Env propagation (Doppler -> Vercel/GitHub)`
3. `INC-3 Production validation (health/checkout/webhook)`
4. `INC-4 Re-enable checkout + post-cutover cleanup`

Suggested labels: `incident`, `payments`, `stripe`, `ops`

Suggested state flow: `Todo -> In Progress -> In Review -> Done`

## Gmail Status Templates

### 1) Maintenance Start

Subject: `Epic Music Space checkout maintenance started`

Body:

```
We started a planned checkout maintenance window to rotate Stripe credentials and validate webhook integrity.

Impact:
- Checkout endpoints may return temporary 503 responses.
- Browsing, auth, and non-checkout features remain available.

Next update: in 15 minutes or when validation completes.
```

### 2) Maintenance In-Progress Update

Subject: `Epic Music Space checkout maintenance in progress`

Body:

```
Checkout maintenance is in progress.

Completed:
- Maintenance gate enabled
- Deployment + health checks passing

In progress:
- Stripe secret/webhook rotation propagation
- End-to-end checkout + webhook validation
```

### 3) Maintenance Resolved

Subject: `Epic Music Space checkout restored`

Body:

```
Checkout maintenance is complete and checkout has been restored.

Validated:
- /api/health/stripe healthy
- Checkout session creation successful
- Webhook signature verification successful

Monitoring will continue for elevated 4xx/5xx and pending transaction drift.
```

### 4) Postmortem Note

Subject: `Postmortem: Stripe rotation + checkout maintenance`

Body:

```
Summary:
- Stripe key rotation executed with maintenance gate.
- Env propagation completed across production/preview/development.
- Checkout and webhook validations passed.

Actions:
- Keep maintenance gate vars documented and tested in smoke checks.
- Run periodic auth + payments synthetic checks.
```

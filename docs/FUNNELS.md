# EMS Core Funnels (Weekly)

## KPI 1: Visitor to Signup

- Definition: Unique visitors who open signup flow -> successful `register_created` event.
- Events:
- `funnel_visitor_to_signup_view`
- `auth_register_created`
- Weekly report:
- Conversion rate = `auth_register_created` / `funnel_visitor_to_signup_view`
- Breakdown by role: `ARTIST`, `LISTENER`, `LABEL`

## KPI 2: Artist Signup to First Upload

- Definition: Artists who created an account -> first successful song upload.
- Events:
- `auth_register_created` (role = `ARTIST`)
- `funnel_artist_signup_to_first_upload`
- Weekly report:
- Activation rate = first-upload artists / new artist signups
- Median time-to-first-upload (if timestamps available in analytics)

## KPI 3: Buyer Visit to First License Purchase

- Definition: Buyer enters purchase flow -> first checkout initiation.
- Events:
- `funnel_signup_role_selected` (role = `LISTENER`)
- `funnel_buyer_visit_to_first_license_purchase`
- Weekly report:
- Purchase-start rate = first purchase starts / buyer discovery sessions
- Segment by budget/use-case filters where available

## Weekly Experiment Cadence

- Monday: Pick one KPI only (north-star for the week).
- Tuesday-Wednesday: Ship one experiment tied to that KPI.
- Thursday: Validate event quality and compare baseline vs experiment.
- Friday: Decide keep/rollback and log lessons.

## Alerting

- Set `AUTH_ALERT_WEBHOOK_URL` for immediate notifications on delivery failures:
- `auth_verification_email_send_failed`
- `auth_resend_email_send_failed`

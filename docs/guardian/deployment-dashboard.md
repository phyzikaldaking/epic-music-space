# EMS Guardian Deployment Intelligence Dashboard

## Core health signals

| Signal | Status | Notes |
|---|---|---|
| Build | Pending | Guardian monitors build failures |
| Route Smoke | Pending | /studio/try and API routes |
| Performance Budget | Pending | Bundle growth checks |
| Security Audit | Pending | npm audit high threshold |
| Freeze Watch | Pending | Detects long route stalls |
| Studio Runtime | Pending | Sentry/runtime integration target |
| Database | Pending | Supabase verification target |

## Required production gates

- lint
- typecheck
- build
- route smoke
- freeze watch
- performance budget
- security audit

## Emergency conditions

- Failed production deployment
- Studio route crash
- Authentication outage
- Payment outage
- Major performance regression
- Severe runtime exception spike

## Recovery workflow

1. Freeze merges.
2. Pull newest logs.
3. Generate AI repair plan.
4. Patch smallest affected surface.
5. Deploy preview.
6. Run Guardian suite.
7. Promote to production only if green.

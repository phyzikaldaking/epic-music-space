# EMS Guardian Sentry Runtime Intelligence

## Purpose

Capture runtime crashes, hydration failures, React exceptions, API failures, and severe Studio rendering errors in production.

## Recommended ingestion targets

- Studio route crashes
- hydration mismatches
- timeline rendering failures
- waveform rendering exceptions
- mixer runtime failures
- API 500 responses
- authentication failures
- Stripe webhook failures

## Required environment variables

- NEXT_PUBLIC_SENTRY_DSN
- SENTRY_AUTH_TOKEN
- SENTRY_ORG
- SENTRY_PROJECT

## Guardian integration

Guardian should:

1. monitor exception spikes
2. classify failures
3. attach traces to incident summaries
4. correlate deployment IDs to crashes
5. open repair plans when spikes exceed thresholds

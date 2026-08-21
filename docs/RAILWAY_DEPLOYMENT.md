# Railway deployment

Railway lifecycle commands are dispatched by `RAILWAY_SERVICE_NAME`. The main Next.js application and the `ems-notifications-worker` and `ems-analytics-worker` services are supported in Perceptive Reverence. The API workspace, payout worker, AI-scoring worker, and the jobs listed in `vercel.json` are not enabled for the initial cutover.

## Service configuration

Railway reads `railway.json` from the repository root.

- Build: `npm run railway:build`
- Pre-deploy: `npm run railway:predeploy` (database migration for the web service; no-op for workers)
- Start: `npm run railway:start`
- Web start: standalone Next.js server
- Worker starts: notification or analytics BullMQ consumer selected by service name
- Deploy triggers: web app, shared database/util packages, lifecycle dispatcher, lockfile, or Railway config changes only

Repository policy allows runtime services only in Perceptive Reverence. Services still connected from Earnest Celebration exit immediately and should be disconnected in Railway to stop duplicate builds and notifications. Do not add a Railway cron schedule, API service, payout worker, or AI-scoring worker during the initial cutover.

## Required variables

Copy the existing production values from the current secret manager or hosting provider. Never copy placeholder values from `.env.example`.

### Database and infrastructure

- `DATABASE_URL`
- `DIRECT_URL`
- `REDIS_URL`
- `PRISMA_MIN_CONNECTION_LIMIT` (recommended: `5` for a single long-lived web service)

### Application and authentication

For the first test deployment, set all URL values to the generated Railway domain. After the custom-domain cutover, change all of them to `https://epicmusicspace.com` and redeploy.

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`
- `SITE_URL`
- `AUTH_URL`
- `NEXTAUTH_URL`
- `AUTH_SECRET`
- `NEXTAUTH_SECRET` (use the same value as `AUTH_SECRET`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CRON_SECRET` (required by the web app even though no Railway cron is enabled)
- `INTERNAL_API_TOKEN`

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Payments

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_STARTER`
- `STRIPE_PRICE_ID_PRO`
- `STRIPE_PRICE_ID_PRIME`
- `STRIPE_PRICE_ID_TEAM`
- `STRIPE_PRICE_ID_LABEL`
- `CHECKOUT_MAINTENANCE_MODE=false`

Create a separate Stripe webhook endpoint for the Railway test URL before testing payments. Move the production webhook URL only during the domain cutover.

### Core integrations

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `OPENAI_API_KEY`

Add LiveKit, Replicate, Mux, Sentry, PostHog, PayPal, Twilio, and social-posting variables only when those features are being tested. If an integration uses a key/secret pair, set both or neither.

## Cutover order

1. Merge the Railway deployment pull request.
2. Generate a Railway public domain and set the URL variables to it.
3. Deploy and verify `/api/health/ready` returns HTTP 200.
4. Test sign-in, database reads/writes, upload and playback, checkout, and Stripe webhooks.
5. Change the URL variables to `https://epicmusicspace.com` and redeploy.
6. Add `epicmusicspace.com` and `www.epicmusicspace.com` in Railway, then update DNS.
7. Keep the previous Vercel deployment available until DNS and production checks pass.

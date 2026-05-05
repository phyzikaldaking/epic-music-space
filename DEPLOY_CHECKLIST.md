# Pre-launch deploy checklist

Everything required before onboarding 20–30 real artists. Items marked **(external)** must be done in a third-party dashboard — there is no code-side equivalent.

---

## 1. Vercel environment variables

Set in Vercel → Project → Settings → Environment Variables, for **Preview + Production**.

### The “infra-only toggles” (the ones you listed)

These are the most common “it deployed but it’s not really live” gotchas. Do these once and the platform stops feeling haunted.

#### `RESEND_API_KEY` (email verification + all transactional email)

1. Resend Dashboard → API Keys → create key.
2. Vercel → Env Vars: set `RESEND_API_KEY` and `EMAIL_FROM`.
3. Resend Dashboard → Domains (or Single Sender) → verify the sender used in `EMAIL_FROM`.

Verify:
- In production, sign up with a new email at `/auth/signup` and confirm you receive a verification email.
- Check Vercel logs for `[email] Send failed` after a signup attempt (should be absent).

#### `POSTHOG_API_KEY` + `POSTHOG_HOST` (analytics sink)

This affects both:
- server-side analytics capture via `apps/web/src/lib/analytics.ts`
- the Render analytics worker in `apps/web/src/workers/analytics.ts`

1. PostHog → Project Settings → grab the Project API Key.
2. Decide host:
   - PostHog Cloud US: `https://us.i.posthog.com` (default in code)
   - PostHog Cloud EU/self-hosted: set `POSTHOG_HOST` explicitly
3. Set env vars in:
   - Render workers (recommended): `POSTHOG_API_KEY`, `POSTHOG_HOST`
   - Vercel (optional but fine): same keys so server-side capture works everywhere

Verify:
- Render logs for `ems-analytics-worker` should print `[analytics-worker] PostHog sink active`.

#### `REDIS_URL` (queues + caching + workers)

This is the switch that makes “background stuff” real: BullMQ workers, queue-backed notifications, and Redis-backed rate limiting/caching.

1. Create Redis (Upstash is easiest) and copy the `rediss://...` URL.
2. Set `REDIS_URL` in:
   - Vercel (web app)
   - Render (all workers) using the same value

Verify:
- Render worker logs should show workers starting (and not exiting with `REDIS_URL is not set`).
- `/status` should stop reporting Redis as missing/degraded (if your status page includes Redis health checks).

#### `INVITE5_COUPON_ID` (Stripe coupon id for the 5-invite reward)

This must be a Stripe *Coupon ID* (starts with `coupon_...`), not a promotion code.

1. Stripe Dashboard → Products → Coupons → Create:
   - Type: percent or amount off
   - Duration: once (recommended) or repeating (your call)
2. Copy the `coupon_...` id and set it as `INVITE5_COUPON_ID` in Vercel (and any worker env that issues rewards).

Verify:
- Use an invite code to reach 5 signups and check the inviter gets a notification that includes a promo code.
- Stripe Dashboard → Promotion codes should show a new code with metadata `{ milestone: "INVITE_5" }`.

#### Supabase storage buckets: `audio` and `covers` (public read)

This is required for uploads to work reliably.

1. Supabase Dashboard → Storage → Buckets → Create bucket `audio`.
2. Create bucket `covers`.
3. Configure both for:
   - Public read access (so browsers can load media)
   - Service-role write access (server writes signed URLs / uploads)

Verify:
- Upload an MP3 + cover at `/studio/new` and confirm:
  - the track page plays audio
  - cover art loads everywhere it’s referenced

### Required for the site to function

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Supabase → Project Settings → Database → Transaction pooler (port 6543, `?pgbouncer=true&sslmode=require`) |
| `DIRECT_URL` | Same dashboard → Session pooler (port 5432) — Prisma migrate needs it |
| `AUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `AUTH_URL`, `NEXTAUTH_URL` | Your canonical domain, e.g. `https://epicmusicspace.com` |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `SITE_URL` | Same canonical domain |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | After registering the webhook — see step 4 |
| `STRIPE_PRICE_ID_STARTER`, `_PRO`, `_PRIME`, `_TEAM`, `_LABEL` | Stripe Dashboard → Products (you create these) |
| `RESEND_API_KEY` | https://resend.com → API Keys |
| `EMAIL_FROM` | A verified Resend sender, e.g. `Epic Music Space <noreply@epicmusicspace.com>` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `CRON_SECRET` | Generate: `openssl rand -base64 32` (Vercel cron sends this as bearer) |

### Strongly recommended

| Variable | Where to get it | Why |
| --- | --- | --- |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SIGNING_SECRET` | https://dashboard.mux.com → Settings → Access Tokens (and webhook config) | Video uploads on posts |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | https://developer.twitter.com | OAuth for posting on behalf of artists (X/Twitter) |
| `IG_CLIENT_ID`, `IG_CLIENT_SECRET`, `IG_USER_ID` | https://developers.facebook.com | Instagram Graph API credentials for posting |
| `SOCIAL_ENCRYPTION_KEY` | Generate: `openssl rand -base64 32` | Key used to encrypt third-party tokens in the database |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` | https://cloud.livekit.io | Live listening rooms |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | https://sentry.io → Project Settings → Client Keys | Error tracking |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens | Source-map upload at build |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | AI scoring + recommendations |
| `REDIS_URL` | Upstash recommended (https://upstash.com) | BullMQ background jobs + caching |
| `POSTHOG_API_KEY`, `POSTHOG_HOST` | https://posthog.com → Project Settings | Product analytics |
| `AUTH_ALERT_WEBHOOK_URL` | Your Slack/Discord incoming webhook | Drift + global-error alerts |
| `ADMIN_BOOTSTRAP_SECRET` | `openssl rand -base64 32` — **unset after first use** | First-admin grant |
| `ADMIN_IP_ALLOWLIST` | Your office/VPN public IPs, comma-separated | Defence-in-depth on `/api/admin/*` |

### Optional

`AD_TRACKING_SALT`, `INTERNAL_API_TOKEN`, `MIN_CREATOR_PAYOUT_USD`, `STRIPE_WEBHOOK_FORWARD_URL`, `LIVEKIT_RECORDING_S3_*`, `ELEVENLABS_*`, `HIGHLIGHT_*`, `AUTO_*`. See `apps/web/.env.example` for descriptions.

---

## 2. Database migrations

`vercel.json` runs `prisma migrate deploy` automatically on every build. Verify after first deploy:

```bash
cd packages/db && npx prisma migrate status
```

Should show "Database schema is up to date!" with these recent migrations applied:

- `20260514000001_user_timeline_posts`
- `20260514000002_admin_audit_log`
- `20260514000003_email_drip_tracking`

---

## 3. Become the first admin

After deploy, while `ADMIN_BOOTSTRAP_SECRET` is still set:

```bash
# 1. Sign up the normal way at /auth/signup, verify your email.
# 2. Then promote yourself:
curl -X POST https://yourdomain.com/api/admin/bootstrap \
  -H "Authorization: Bearer $ADMIN_BOOTSTRAP_SECRET"
```

Then **remove `ADMIN_BOOTSTRAP_SECRET` from Vercel** to disable the endpoint forever.

The grant lands in `AdminActionLog` with action `user.bootstrap_admin`.

---

## 4. Webhook configuration

### Stripe — https://dashboard.stripe.com/webhooks

- Endpoint URL: `https://yourdomain.com/api/webhooks/stripe`
- Events to subscribe:
  - `checkout.session.completed`
  - `checkout.session.expired`
  - `payment_intent.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `account.updated`
- Copy the signing secret → set `STRIPE_WEBHOOK_SECRET`

### Mux — https://dashboard.mux.com/settings/webhooks

- Endpoint URL: `https://yourdomain.com/api/webhooks/mux`
- Events to subscribe:
  - `video.upload.asset_created`
  - `video.asset.ready`
  - `video.asset.errored`
- Copy the signing secret → set `MUX_WEBHOOK_SIGNING_SECRET`

### LiveKit (only if rooms are enabled)

- Endpoint URL: `https://yourdomain.com/api/webhooks/livekit`
- Set in LiveKit Cloud → Project → Webhooks

---

## 5. Stripe Tax automation **(external)**

Enable at https://dashboard.stripe.com/settings/tax. Then in each **Stripe Product** → enable "Automatically calculate tax." The codebase doesn't need changes — Stripe handles it at checkout-session level. Without this, US sales tax is your problem to remit manually.

---

## 6. Supabase point-in-time-recovery **(external)**

In Supabase Dashboard → Project → Settings → Add-ons:

- **Free tier**: 7 days of daily backups, no PITR. Acceptable for the demo, **not** for paying artists.
- **Pro tier ($25/mo)**: 14 days daily backups + 7-day PITR (per-second restore window). **Required before live customer money flows.**
- **Pro + PITR add-on**: extends PITR window up to 28 days.

Action: upgrade the project to Pro **before** the first real artist signs up. Cost is well below the noise of a single failed payout.

---

## 7. Smoke test

After every deploy:

```bash
BASE_URL=https://yourdomain.com npm run smoke
```

Hits ~30 routes (public pages, auth pages, key API endpoints) in parallel and asserts each returns the expected status. Exits non-zero on any failure — wire it into your CI if you want hard gates.

Manual checks the script can't do (because no auth):

- [ ] Sign up as a new artist on a fresh email → email arrives → click link → land on `/dashboard` → welcome banner shows 0/3 steps.
- [ ] Click "Set up studio" → username chosen → studio appears.
- [ ] `/studio/new` → upload one MP3 + cover → song appears on `/marketplace` and your `/studio/{username}`.
- [ ] Open `/feed` from a second browser → write a post + attach a 30-second MP4 → post lands → after ~30 seconds video transitions from "Encoding video…" to playable Mux player.
- [ ] On a third browser (incognito), buy a license — Stripe test card `4242 4242 4242 4242` exp `12/34` cvc `123` — checkout completes → redirect to `/track/{id}?checkout=success` → license appears on buyer's `/dashboard`.
- [ ] First-sale email arrives in artist's inbox.
- [ ] Visit `/status` → all configured services show green dots.
- [ ] On a phone-sized viewport, mobile nav opens, links work, body scroll locks while open.

---

## Appendix A. Render workers (BullMQ)

`render.yaml` at the repo root is ready. The workers are:
- `ems-notifications-worker`
- `ems-analytics-worker`
- `ems-ai-scoring-worker`

Required env vars (minimum viable):
- `REDIS_URL`
- `DATABASE_URL` and `DIRECT_URL` (for workers that touch Prisma)
- `OPENAI_API_KEY` (AI scoring worker)
- `POSTHOG_API_KEY` + optional `POSTHOG_HOST` (analytics worker)

Verify:
- Each worker shows “Started listening …” logs and stays up for at least a few minutes.


## 8. Post-launch monitoring

### `/status` page
Auto-refreshes every 30 seconds. Bookmark it.

### Sentry
Issues will appear at https://sentry.io/organizations/{ORG}/issues/ — set up email alerts on first occurrence + Slack integration for critical-tag errors.

### Reconciliation cron
Runs daily at 06:00 UTC. Drifts > $1 or > 1% between Stripe and the DB ledger fire to `AUTH_ALERT_WEBHOOK_URL`. Check the cron logs at Vercel → Logs → filter by `/api/cron/reconcile-ledger`.

### Email drip
Hourly cron at minute 0. Stats per step (`sent`/`skipped`/`failed`) returned in the response body, visible in Vercel Logs.

### Admin audit log
Query with:
```sql
SELECT * FROM "AdminActionLog" ORDER BY "createdAt" DESC LIMIT 50;
```
Every admin mutation (song delete, user role change, auction cancel, bootstrap grant) is recorded.

---

## 9. Roll-back plan

If a deploy breaks something:

1. **Vercel** → Deployments → find the last known-good production deploy → "Promote to Production." Takes ~10 seconds.
2. If a database migration is the cause, **do not** auto-rollback the migration — test it on a fresh branch first. Use `prisma migrate resolve --rolled-back {migration_name}` only after confirming no data has been written under the new schema.
3. Stripe webhooks have built-in retry — they'll redeliver any events the old version missed.
4. Mux webhook redelivery: log into Mux dashboard → Webhooks → individual event → "Resend."

---

## 10. Things explicitly out of scope (for now)

- **CSRF tokens**: NextAuth v5 + same-site session cookies cover this. Add only if a security audit demands it.
- **Per-user IP rate limits on auth**: covered by `strictLimiter` on `/api/auth/register`. Tune if needed.
- **Two-factor auth**: not built. Acceptable for v1; add when you have customer accounts > $1k LTV.
- **GDPR data export endpoint**: not built. Required when you onboard EU users at scale; build before then.

---

Last updated: see `git log -1 -- DEPLOY_CHECKLIST.md`.

# Epic Music Space — Site Completion Checklist

Legend: `[ ]` = todo · `[x]` = done · `[~]` = partial

---

## 🔴 CRITICAL (blocking production)

- [x] **C1 — Cron jobs:** All cron routes use timing-safe `requireCronRequest`. `weekly-digest` added to `vercel.json`. Vercel auto-injects `Authorization: Bearer ${CRON_SECRET}` — set that env var in Vercel dashboard to activate.
- [x] **C2 — Ad payments:** `handleAdPurchaseCompleted` in Stripe webhook flips `isActive: true` and mirrors to revenue ledger.
- [x] **C3 — `streamCount`:** `AudioPlayer.tsx` calls `POST /api/songs/${songId}/stream` on every play.
- [x] **C4 — Subscription tier enforcement:** `subscriptionTier` on User model + `getTierLimits` enforced in songs/create, market/buy, checkout, boost, versus, and analytics routes.
- [ ] **C5 — Workers have no deployment:** `src/workers/` (notifications, analytics, aiScoring) require a long-running process (BullMQ + Redis). Set `REDIS_URL` in Vercel env and wire a Render/Railway worker dyno pointing to `apps/api`. Until then, notifications silently drop.
  Verify: Render workers are deployed from `render.yaml` and logs show each worker “Started listening …” without exiting.

---

## 🟠 HIGH (broken features / wrong data)

- [x] **H1 — Pricing page price mismatch:** `/pricing` and subscription checkout both use `$79/mo` for Prime. Pricing uses Stripe price IDs from env vars — no hardcoded mismatch.
- [x] **H2 — Label owner signing UI:** Label `[id]` page has a full invite-artist form.
- [x] **H3 — Profile avatar upload:** `/profile/edit` has a file-picker wired to `/api/upload` (Supabase signed URL flow) with MIME + size validation.
- [ ] **H4 — Supabase storage buckets not created:** `/api/upload` uses `supabase.storage.from("audio")` and `.from("covers")` — create these buckets in Supabase dashboard (set public read, service-role write). **(external — one-time setup)**
  Verify: upload a track + cover at `/studio/new` and confirm playback + images load.
- [x] **H5 — `next.config.mjs` `ignoreBuildErrors`:** Removed. Build will fail on TS/ESLint errors.
- [x] **H6 — Signout CSRF:** `NavbarAuth` uses `<SignOutButton>` which calls `signOut()` from `next-auth/react`.
- [x] **H7 — `AUCTION_BID_RECEIVED` icon:** Notifications page icon map has `AUCTION_BID_RECEIVED: "🔨"`.
- [x] **H8 — Demo audio files:** Files exist in `/public/demo/audio/`. `demoTracks.ts` falls back to local slugified paths when Supabase bucket is empty.
- [ ] **H9 — No ADMIN panel:** `/admin` routes and UI exist (with ADMIN role guard + IP allowlist). First admin promoted via `POST /api/admin/bootstrap` using `ADMIN_BOOTSTRAP_SECRET`. **(env var setup required)**

---

## 🟡 MEDIUM (polish / edge cases)

- [x] **M1 — Missing `loading.tsx` on most pages:** All dynamic routes now have skeleton loaders.
- [x] **M2 — Missing per-route `error.tsx`:** Route-level error boundaries added to all dynamic pages.
- [x] **M3 — Email verification:** `POST /api/auth/register` creates a `VerificationToken`, calls `sendVerificationEmail()` via Resend, and blocks sign-in for unverified credential accounts. Requires `RESEND_API_KEY` env var in Vercel dashboard.
  Verify: production signup sends a verification email (not the dev console URL).
- [x] **M4 — Analytics page is ungated:** `/analytics` checks `getActiveLimits(user).canAccessAnalytics` and redirects to `/pricing?reason=analytics` for non-qualifying tiers.
- [x] **M5 — Invite milestone rewards:** INVITE_5 creates a real Stripe promotion code (via `INVITE5_COUPON_ID` env var) and includes the code in the in-app notification. INVITE_10 increments `studio.level`. INVITE_50 upgrades `subscriptionTier` to `PRIME`.
- [x] **M6 — `city/page.tsx` missing `<Suspense>`:** City route has been reorganized; no `CityScene3DClient` found — city is a standard page.
- [x] **M7 — Middleware path:** Middleware matcher covers `/dashboard/:path*` which includes `/dashboard/payouts`. No stray `/payouts` entry exists — non-issue.
- [ ] **M8 — `<img>` used in OG image routes instead of `<Image>`:** OG image routes (`opengraph-image.tsx`) must use plain `<img>` — satori/Vercel OG doesn't support `next/image`. Other pages already use `<Image>`.
- [x] **M9 — Analytics worker PostHog:** Worker initialises a real `PostHog` client when `POSTHOG_API_KEY` is set, falls back to stdout. Set `POSTHOG_API_KEY` + `POSTHOG_HOST` in the Render worker env (already wired in `render.yaml`).
  Verify: analytics worker logs include `[analytics-worker] PostHog sink active`.

---

## 🟢 LOW (SEO, cleanup, polish)

- [x] **L1 — `sitemap.ts` and `robots.ts` missing:** Both files exist at `app/sitemap.ts` and `app/robots.ts`.
- [x] **L2 — `/legal/licensing#ai-score` anchor:** Anchor `id="ai-score"` exists on the licensing page.
- [x] **L3 — `HeroCityCanvas.tsx` dead code:** File does not exist in the current tree — already removed.
- [x] **L4 — `analytics/page.tsx` needs `dynamic = "force-dynamic"`:** Added.
- [x] **L5 — 3D city page has no loading state:** City route has a `<Suspense>` fallback.

---

## ✅ Phase 2 Viral Growth — Complete

- [x] Invite engine: `InviteCode` schema, `/invite` page, referral link generation, sign-up flow wires `usedById`
- [x] Badge system: `UserBadge` schema, `awardBadge()` helper, 8 badge types wired to real events
- [x] WHO WON page (`/versus/[id]`): real-time vote bars, countdown timer, X/Twitter share intent, copy link, embed code, tip-with-vote Stripe Checkout, signup CTA for logged-out users
- [x] Dashboard: invite widget showing referral link + milestone progress
- [x] Studio page: badge display with `BADGE_META` icons + dates
- [x] Weekly digest cron: `api/cron/weekly-digest` + `vercel.json` schedule (Fridays 14:00 UTC)

---

## 🚀 Phase 3 — Growth & Monetisation

### Env vars required to activate already-built features

| Env Var | Feature |
| --------- | --------- |
| `RESEND_API_KEY` | Email verification on credential signup |
| `POSTHOG_API_KEY` + `POSTHOG_HOST` | Analytics worker → PostHog sink |
| `REDIS_URL` (Upstash) | BullMQ — notifications, analytics, AI scoring workers |
| `INVITE5_COUPON_ID` | Stripe promo code auto-issued at 5-invite milestone |
| `ADMIN_BOOTSTRAP_SECRET` | Promote first ADMIN user via `POST /api/admin/bootstrap` |
| `CRON_SECRET` | Authorize Vercel cron scheduler to hit all cron routes |

### Deploy BullMQ workers

`render.yaml` at root is ready to deploy. Connect the repo on Render, set env vars above, and all 3 workers start automatically.

### Code improvements shipped this session

- [x] **Mobile seek bar touch support** — `handleSeekTouch` added to AudioPlayer seek bar (`onTouchStart` + `onTouchMove`). Shared `seekToX(clientX, el)` helper used by both mouse and touch.
- [x] **MediaSession API** — `AudioPlayer.tsx` now registers lock-screen / notification-shade controls (play, pause, seek ±10s, stop) and keeps the OS scrubber in sync via `setPositionState`. Works on Android Chrome, iOS Safari 15+, macOS.
- [x] **INVITE_5 Stripe promo code** — `checkInviteMilestones` now calls `stripe.promotionCodes.create` when `INVITE5_COUPON_ID` is set. The promo code is embedded in the in-app notification body so the user can copy it immediately.

### New features to build next

- [ ] **Versus battle wager** — Allow artists to stake credits when creating a battle. Winner receives ~90% of the pool (10% platform fee). Requires `creditBalance Int @default(0)` on `User` schema + new migration.
- [ ] **Pg_trgm full-text search** — Enable the `pg_trgm` extension in Supabase (`CREATE EXTENSION IF NOT EXISTS pg_trgm`) and add GIN indexes on `Song.title`, `Song.artist`, `Studio.username` for ranked trigram search.
- [x] **Mobile seek bar touch support** — `handleSeekTouch` added to AudioPlayer seek bar (`onTouchStart` + `onTouchMove`). Shared `seekToX(clientX, el)` helper used by both mouse and touch.
- [ ] **Notification promo code UI** — Surface the `promoCode` field from notification metadata on the `/notifications` page as a copyable badge rather than plain body text.

---

## ✅ Already Done

- [x] Auction API routes (`/api/auctions`, `/api/auctions/[id]`, `/api/auctions/[id]/bid`)
- [x] Auction UI pages (`/auctions`, `/auctions/[id]`)
- [x] Tips API (`/api/tips`)
- [x] Cron routes (`/api/cron/settle-auctions`, `/api/cron/expire-battles`) — fail-closed auth
- [x] Cron entries added to `vercel.json` *(headers still need adding — see C1)*
- [x] `SessionProvider` added to root layout via `<Providers>`
- [x] Bid route uses `winnerId` instead of fragile amount lookup
- [x] Sold-out license check on auction creation
- [x] Tailwind opacity classes fixed (`/8` → `/[0.08]`)
- [x] `tick` dead-code hack replaced with clean `forceUpdate` pattern
- [x] `prisma generate` added to build command

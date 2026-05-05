# Epic Music Space — Site Completion Checklist

Legend: `[ ]` = todo · `[x]` = done · `[~]` = partial

---

## 🔴 CRITICAL (blocking production)

- [x] **C1 — Cron jobs:** All cron routes use timing-safe `requireCronRequest`. `weekly-digest` added to `vercel.json`. Vercel auto-injects `Authorization: Bearer ${CRON_SECRET}` — set that env var in Vercel dashboard to activate.
- [x] **C2 — Ad payments:** `handleAdPurchaseCompleted` in Stripe webhook flips `isActive: true` and mirrors to revenue ledger.
- [x] **C3 — `streamCount`:** `AudioPlayer.tsx` calls `POST /api/songs/${songId}/stream` on every play.
- [x] **C4 — Subscription tier enforcement:** `subscriptionTier` on User model + `getTierLimits` enforced in songs/create, market/buy, checkout, boost, versus, and analytics routes.
- [ ] **C5 — Workers have no deployment:** `src/workers/` (notifications, analytics, aiScoring) require a long-running process (BullMQ + Redis). Set `REDIS_URL` in Vercel env and wire a Render/Railway worker dyno pointing to `apps/api`. Until then, notifications silently drop.

---

## 🟠 HIGH (broken features / wrong data)

- [x] **H1 — Pricing page price mismatch:** `/pricing` and subscription checkout both use `$79/mo` for Prime. Pricing uses Stripe price IDs from env vars — no hardcoded mismatch.
- [x] **H2 — Label owner signing UI:** Label `[id]` page has a full invite-artist form.
- [x] **H3 — Profile avatar upload:** `/profile/edit` has a file-picker wired to `/api/upload` (Supabase signed URL flow) with MIME + size validation.
- [ ] **H4 — Supabase storage buckets not created:** `/api/upload` uses `supabase.storage.from("audio")` and `.from("covers")` — create these buckets in Supabase dashboard (set public read, service-role write). **(external — one-time setup)**
- [x] **H5 — `next.config.mjs` `ignoreBuildErrors`:** Removed. Build will fail on TS/ESLint errors.
- [x] **H6 — Signout CSRF:** `NavbarAuth` uses `<SignOutButton>` which calls `signOut()` from `next-auth/react`.
- [x] **H7 — `AUCTION_BID_RECEIVED` icon:** Notifications page icon map has `AUCTION_BID_RECEIVED: "🔨"`.
- [x] **H8 — Demo audio files:** Files exist in `/public/demo/audio/`. `demoTracks.ts` falls back to local slugified paths when Supabase bucket is empty.
- [ ] **H9 — No ADMIN panel:** `/admin` routes and UI exist (with ADMIN role guard + IP allowlist). First admin promoted via `POST /api/admin/bootstrap` using `ADMIN_BOOTSTRAP_SECRET`. **(env var setup required)**

---

## 🟡 MEDIUM (polish / edge cases)

- [x] **M1 — Missing `loading.tsx` on most pages:** All dynamic routes now have skeleton loaders.
- [x] **M2 — Missing per-route `error.tsx`:** Route-level error boundaries added to all dynamic pages.
- [ ] **M3 — Email verification not implemented:** Credential signups never verify email. `User.emailVerified` is only set by OAuth providers. **(requires Resend + email template)**
- [x] **M4 — Analytics page is ungated:** `/analytics` checks `getActiveLimits(user).canAccessAnalytics` and redirects to `/pricing?reason=analytics` for non-qualifying tiers.
- [ ] **M5 — Invite milestone rewards are text-only:** Milestones (5/10/50 invites) display correctly; actual ad credit / plan upgrade credit issuance not yet wired.
- [x] **M6 — `city/page.tsx` missing `<Suspense>`:** City route has been reorganized; no `CityScene3DClient` found — city is a standard page.
- [ ] **M7 — Middleware protects `/payouts` but the real path is `/dashboard/payouts`:** Minor double-redirect; low priority.
- [ ] **M8 — `<img>` used in OG image routes instead of `<Image>`:** OG image routes (`opengraph-image.tsx`) must use plain `<img>` — satori/Vercel OG doesn't support `next/image`. Other pages already use `<Image>`.
- [ ] **M9 — Analytics worker TODO not connected:** `src/workers/analytics.ts` — events are `console.info`'d only. Wire PostHog via `POSTHOG_API_KEY` env var.

---

## 🟢 LOW (SEO, cleanup, polish)

- [x] **L1 — `sitemap.ts` and `robots.ts` missing:** Both files exist at `app/sitemap.ts` and `app/robots.ts`.
- [x] **L2 — `/legal/licensing#ai-score` anchor:** Anchor `id="ai-score"` exists on the licensing page.
- [ ] **L3 — `HeroCityCanvas.tsx` is dead code:** Component exists in `/components` but is imported nowhere. Remove it.
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

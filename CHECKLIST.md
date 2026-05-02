# Epic Music Space — Site Completion Checklist

Legend: `[ ]` = todo · `[x]` = done · `[~]` = partial

---

## 🔴 CRITICAL (blocking production)

- [ ] **C1 — Cron jobs never run:** `vercel.json` cron entries are missing the `Authorization` header, so Vercel's own scheduler gets 401'd every 5 min. Auctions and battles never auto-settle.
- [ ] **C2 — Ad payments never activate:** `POST /api/ads` creates a Stripe checkout but the webhook has no `AD_PURCHASE` handler — `AdPlacement.isActive` is never flipped to `true`.
- [ ] **C3 — `streamCount` always 0:** `AudioPlayer.tsx` never calls an API when a track plays. Every scoring and analytics metric that reads `streamCount` is permanently zero.
- [ ] **C4 — No subscription tier enforcement:** Nothing on the `User` model tracks the active plan tier. Every "requires Prime" UI hint is cosmetic — the API never blocks a Starter user from exceeding their limit.
- [ ] **C5 — Workers have no deployment:** `src/workers/` (notifications, analytics, aiScoring) require a long-running process. Without the notifications worker, every `enqueueNotification()` call across ~12 routes silently drops — users get zero in-app notifications.

---

## 🟠 HIGH (broken features / wrong data)

- [ ] **H1 — Pricing page price mismatch:** `/pricing` shows Prime at **$49/mo**; `/api/subscriptions/route.ts` charges **$79/mo**. User sees one price and gets charged another.
- [ ] **H2 — Label owner signing UI is a dev note:** `/label/[id]/page.tsx` lines 164–173 literally tells users to "use the API directly." No form exists to invite artists.
- [ ] **H3 — Profile avatar is a URL text field, not an upload:** `/profile/edit` has a text input for avatar URL. The upload API (`/api/upload`) exists but isn't wired to this form.
- [ ] **H4 — Supabase storage buckets not created:** `/api/upload` uses `supabase.storage.from("audio")` and `.from("covers")` — these buckets must be manually created in Supabase or all uploads 500.
- [ ] **H5 — `next.config.mjs` silences all TypeScript and ESLint errors:** `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` mean broken code ships silently. Remove once build is clean.
- [ ] **H6 — Signout may fail CSRF check:** `Navbar.tsx` POSTs directly to `/api/auth/signout` with no CSRF token. Replace with NextAuth `signOut()` client action.
- [ ] **H7 — `AUCTION_BID_RECEIVED` notification type not in icon map:** Seller bid notifications enqueue type `AUCTION_BID_RECEIVED` but `/notifications/page.tsx` icon map has `AUCTION_BID`. Seller sees a plain 🔔 instead of the hammer icon.
- [ ] **H8 — Demo audio files missing:** `src/lib/demoTracks.ts` references `/demo/audio/*.wav` which don't exist in `/public/`. AudioPlayer will 404 on an empty DB (first-run experience broken).
- [ ] **H9 — No ADMIN panel or way to elevate users:** `Role.ADMIN` is referenced in API guards but there is no `/admin` route, page, or UI to manage users/content.

---

## 🟡 MEDIUM (polish / edge cases)

- [ ] **M1 — Missing `loading.tsx` on most pages:** Only `/dashboard`, `/leaderboard`, `/marketplace` have skeleton loaders. All others show a blank screen while fetching.
  - Add to: `/auctions`, `/auctions/[id]`, `/ai`, `/analytics`, `/ads`, `/boost`, `/city`, `/invite`, `/label`, `/label/[id]`, `/label/new`, `/notifications`, `/pricing`, `/profile/edit`, `/studio/[username]`, `/track/[id]`, `/versus`, `/versus/[id]`
- [ ] **M2 — Missing per-route `error.tsx`:** A DB timeout on any dynamic page surfaces the generic root error with no context. Add route-level error boundaries to all dynamic pages.
- [ ] **M3 — Email verification not implemented:** Credential signups never verify email. `User.emailVerified` is only set by OAuth providers.
- [ ] **M4 — Analytics page is ungated:** `/analytics` is accessible to all tiers. Pricing page promises analytics is a Prime-only feature.
- [ ] **M5 — Invite milestone rewards are text-only:** Milestones (5/10/50 invites) promise "ad credit" and "Prime plan upgrade credit" — no code actually issues these.
- [ ] **M6 — `city/page.tsx` missing `<Suspense>` around 3D canvas:** Three.js bundle is heavy; no fallback means the whole page blocks while it loads.
- [ ] **M7 — Middleware protects `/payouts` but the real path is `/dashboard/payouts`:** The middleware redirect is a no-op for this route (the page itself redirects server-side, but it's an extra round-trip).
- [ ] **M8 — `<img>` used everywhere instead of `<Image>`:** Multiple pages use raw `<img>` with eslint-disable suppression. Switch to `next/image` for optimization and LCP improvement.
- [ ] **M9 — Analytics worker TODO not connected:** `src/workers/analytics.ts` line 36 — events are `console.info`'d only. No real PostHog / Mixpanel / BigQuery sink wired.

---

## 🟢 LOW (SEO, cleanup, polish)

- [ ] **L1 — `sitemap.ts` and `robots.ts` missing:** `/app/sitemap.ts` and `/app/robots.ts` don't exist. Easy SEO wins.
- [ ] **L2 — `/legal/licensing#ai-score` anchor missing:** Footer links to this anchor but the page likely has no `id="ai-score"` element — silently scrolls to top.
- [ ] **L3 — `HeroCityCanvas.tsx` is dead code:** Component exists in `/components` but is imported nowhere. Remove it.
- [ ] **L4 — `analytics/page.tsx` needs `dynamic = "force-dynamic"`:** Without it, stream count data may be stale-cached on the first render.
- [ ] **L5 — 3D city page has no loading state:** `CityScene3DClient` (Three.js) loads without a `<Suspense>` fallback spinner.

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

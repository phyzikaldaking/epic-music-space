# Epic Music Space Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Epic Music Space as a polished, production-ready web product with a coherent Black Label public experience, a professional producer-first Studio, verified critical journeys, and production infrastructure that fails safely.

**Architecture:** Keep the public product and Studio as two coordinated visual contexts: the public site uses the editorial Black Label system while Studio preserves a dense professional-console interaction model. Reuse shared tokens, shell primitives, auth/data services, and observability; validate every change through unit/integration tests, Playwright browser journeys, responsive visual QA, and production smoke checks.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript 5.6, Tailwind CSS 3.4, NextAuth 5 beta, Prisma 5.22, Supabase, Stripe, Resend, Redis/BullMQ, PostHog, Sentry, Playwright, Vitest, Vercel, Railway/Render-compatible workers.

**Spec:** `CHECKLIST.md`, `DEPLOY_CHECKLIST.md`, `DAW_BLUEPRINT.md`, `docs/EMS_PRODUCTION_BLUEPRINT.md`

## Global Constraints

- Node runtime is `>=22 <23` and package manager is npm 11.11.0.
- Do not reintroduce `ignoreBuildErrors`; TypeScript and lint failures must block release.
- Public pages use the Black Label editorial visual system; Studio remains a professional producer workspace rather than a marketing-page skin.
- Catalog/social proof must be backed by real application data or an explicitly designed empty/fallback state.
- Critical flows must remain usable when optional services such as PostHog, Redis, WebGL, or recommendation services are degraded.
- Production requires working database, authentication, Stripe, Resend, Supabase storage, cron authorization, and worker infrastructure.
- All release-critical UI must be responsive and keyboard accessible, with visible focus states and reduced-motion behavior where applicable.

---

### Task 1: Establish the release gate and route inventory

**Files:**
- Create: `docs/release/route-inventory.md`
- Create: `docs/release/release-gate.md`
- Modify: `CHECKLIST.md`

**Interfaces:**
- Consumes: App Router tree under `apps/web/src/app`, existing `CHECKLIST.md`, `DEPLOY_CHECKLIST.md`.
- Produces: canonical route matrix and binary release-gate checklist used by all later tasks.

- [ ] **Step 1: Inventory every customer-facing route** and classify it as Public, Auth, Studio, Commerce, Dashboard, Admin, Legal, or System; record auth requirement, primary CTA, data dependency, loading state, error state, empty state, and mobile status.
- [ ] **Step 2: Define release gates** for build/typecheck/lint/tests, critical browser flows, accessibility, responsive layouts, production services, observability, SEO, and rollback.
- [ ] **Step 3: Reconcile `CHECKLIST.md`** so every unresolved production blocker points to one release-gate item rather than duplicating status in multiple places.
- [ ] **Step 4: Run `npm run typecheck`, `npm run lint`, and `npm test`** and record the exact baseline failures in `docs/release/release-gate.md`; do not mark a failing gate green.
- [ ] **Step 5: Commit:** `git commit -am "docs: establish production release gate"`.

### Task 2: Lock the Black Label design system and global shell

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: relevant shared navigation/footer files under `apps/web/src/components`
- Test: add/update shared shell tests under `apps/web/src/**/__tests__`

**Interfaces:**
- Consumes: existing Black Label homepage styles and shell from PR #43.
- Produces: reusable typography, spacing, surface, border, motion, focus, button, link, card, container, and navigation primitives.

- [ ] **Step 1: Write failing shell tests** asserting correct public navigation destinations, authenticated/anonymous CTA behavior, footer destinations, and accessible names.
- [ ] **Step 2: Run the focused Vitest files** and confirm the new assertions fail for any missing behavior.
- [ ] **Step 3: Consolidate design tokens** into CSS custom properties/utilities: background/surface hierarchy, text hierarchy, accent, borders, radii, spacing rhythm, max widths, focus ring, transition durations, and reduced-motion overrides.
- [ ] **Step 4: Normalize the global header/footer** so desktop, tablet, and mobile navigation expose the same destinations without overflow or inaccessible hidden controls.
- [ ] **Step 5: Run focused tests, `npm run typecheck`, and `npm --workspace apps/web run lint`.**
- [ ] **Step 6: Commit:** `git commit -am "feat: lock black label design system"`.

### Task 3: Finish homepage and public discovery surfaces

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: public discovery/market/catalog route pages under `apps/web/src/app`
- Modify/Create: reusable public cards/sections under `apps/web/src/components`
- Test: public-page Vitest tests and Playwright specs under `apps/web/e2e`

**Interfaces:**
- Consumes: shared Black Label primitives from Task 2 and existing catalog queries.
- Produces: consistent home, discovery, marketplace, artist, track, and creator-facing public presentation.

- [ ] **Step 1: Add browser assertions** for homepage hero, primary CTAs, currently-moving content, discovery navigation, marketplace navigation, and a representative track/artist page.
- [ ] **Step 2: Verify tests fail** for visual/behavioral gaps before implementation.
- [ ] **Step 3: Replace one-off public-page styling** with the shared Black Label primitives while preserving route-specific information architecture.
- [ ] **Step 4: Implement explicit loading, empty, degraded-data, and error presentation** so missing catalog data never yields a broken or misleading page.
- [ ] **Step 5: Verify responsive layouts** at 375x812, 768x1024, 1440x900, and 1920x1080 with Playwright screenshots and no horizontal overflow.
- [ ] **Step 6: Run focused tests, typecheck, lint, and browser specs.**
- [ ] **Step 7: Commit:** `git commit -am "feat: finish public black label experience"`.

### Task 4: Finish authentication, onboarding, pricing, support, and legal UX

**Files:**
- Modify: routes under `apps/web/src/app/auth`, `apps/web/src/app/pricing`, `apps/web/src/app/contact`, and legal routes
- Modify: auth form/shared form components under `apps/web/src/components`
- Test: auth Vitest tests and Playwright auth/onboarding specs

**Interfaces:**
- Consumes: NextAuth identity services, Resend verification flow, Stripe price configuration, Black Label form primitives.
- Produces: coherent anonymous-to-account conversion journey with explicit validation and recovery states.

- [ ] **Step 1: Add failing tests** for signup validation, sign-in errors, verification-required state, safe redirect handling, pricing CTA routing, and legal/support navigation.
- [ ] **Step 2: Implement consistent form hierarchy** including labels, help text, inline validation, disabled/submitting states, password-manager-friendly fields, and keyboard focus.
- [ ] **Step 3: Ensure auth failures are actionable** and never expose secrets, stack traces, or raw provider errors.
- [ ] **Step 4: Verify pricing copy and checkout tier mapping** against environment-backed Stripe price IDs.
- [ ] **Step 5: Run `npm --workspace apps/web run test:auth`, focused Playwright specs, typecheck, and lint.**
- [ ] **Step 6: Commit:** `git commit -am "feat: polish auth onboarding and trust surfaces"`.

### Task 5: Finish Studio as a producer-first workspace

**Files:**
- Modify: Studio routes under `apps/web/src/app/studio`
- Modify: producer controls/components under `apps/web/src/components`
- Reference: `DAW_BLUEPRINT.md`
- Test: Studio Vitest tests and Playwright Studio specs

**Interfaces:**
- Consumes: existing audio/upload APIs, subscription limits, Supabase signed-upload flow, shared global tokens.
- Produces: functional Studio shell with stable workspace geometry, clear tool hierarchy, and reliable upload/publish flow.

- [ ] **Step 1: Add failing tests** for Studio entry, project/new-track creation, upload validation, publish controls, subscription-limit feedback, and recovery from upload failure.
- [ ] **Step 2: Normalize Studio layout geometry** so transport, timeline/work area, inspector/sidebar, primary controls, and status feedback remain usable across supported desktop widths.
- [ ] **Step 3: Preserve professional-console density** while applying shared typography, focus, modal, button, and status semantics from the Black Label system.
- [ ] **Step 4: Ensure every visible Studio control is either functional or removed/clearly disabled**; no decorative controls may imply unavailable functionality.
- [ ] **Step 5: Verify upload of supported audio + cover, validation of unsupported/oversized files, progress feedback, publish completion, and resulting track playback.**
- [ ] **Step 6: Run Studio tests, browser specs, typecheck, and lint.**
- [ ] **Step 7: Commit:** `git commit -am "feat: finish producer studio workflow"`.

### Task 6: Verify commerce, playback, marketplace, and dashboard state

**Files:**
- Modify: commerce/marketplace/dashboard routes and components only where tests expose defects
- Modify: `apps/web/src/components/AudioPlayer.tsx` only if playback tests expose defects
- Test: `apps/web/src/lib/__tests__/criticalFlows.e2e.test.ts` and Playwright commerce/playback specs

**Interfaces:**
- Consumes: Stripe checkout/webhooks, tier enforcement, stream-count endpoint, MediaSession support, marketplace APIs.
- Produces: verified listen-to-buy-to-dashboard lifecycle.

- [ ] **Step 1: Extend critical-flow tests** for play/seek/stop, stream registration, marketplace purchase eligibility, checkout creation, webhook-driven entitlement/state, and dashboard visibility.
- [ ] **Step 2: Run focused tests and capture failures.**
- [ ] **Step 3: Fix only demonstrated defects** in playback, commerce, or state propagation; preserve idempotent webhook handling.
- [ ] **Step 4: Add explicit pending/success/failure UI** for checkout and purchase transitions so users never need to infer transaction state.
- [ ] **Step 5: Run critical-flow tests, Playwright flows, typecheck, and lint.**
- [ ] **Step 6: Commit:** `git commit -am "fix: harden playback commerce and dashboard flows"`.

### Task 7: Accessibility, responsive, performance, and SEO hardening

**Files:**
- Modify: affected route/component files found by audit
- Modify: `apps/web/src/app/sitemap.ts`, `apps/web/src/app/robots.ts`, route metadata only where required
- Modify: `apps/web/.lighthouserc.json` if budgets are not already explicit
- Test: Playwright accessibility/responsive specs and performance scripts

**Interfaces:**
- Consumes: completed UI from Tasks 2-6.
- Produces: release-grade keyboard, screen-size, metadata, and performance behavior.

- [ ] **Step 1: Add automated checks** for landmark structure, accessible names, keyboard navigation, focus visibility, reduced motion, and no horizontal overflow on release-critical routes.
- [ ] **Step 2: Fix semantic/accessibility defects** including unlabeled controls, non-button click targets, insufficient focus treatment, heading-order defects, and modal focus behavior.
- [ ] **Step 3: Audit image/media loading and client bundles**; lazy-load noncritical media/3D and avoid blocking homepage interactivity on optional visual systems.
- [ ] **Step 4: Verify canonical metadata, Open Graph metadata, sitemap, robots policy, and indexability for public pages; keep authenticated/admin surfaces out of search indexing where appropriate.
- [ ] **Step 5: Run `npm run perf:budget`, Playwright responsive/a11y specs, typecheck, lint, and build.**
- [ ] **Step 6: Commit:** `git commit -am "perf: harden accessibility seo and responsiveness"`.

### Task 8: Production infrastructure and graceful degradation

**Files:**
- Modify: `.env.example`, `apps/web/.env.example`, `DEPLOY_CHECKLIST.md` only as required
- Modify: worker/deployment configuration such as `render.yaml`, Railway config, or scripts under `scripts/ops` only where verification exposes defects
- Test: env checks, reliability smoke scripts, auth smoke, worker startup checks

**Interfaces:**
- Consumes: Vercel web deployment, Prisma/Supabase, Stripe, Resend, Redis/BullMQ, PostHog, Sentry, cron secret.
- Produces: configured and observable production services with documented external actions.

- [ ] **Step 1: Run environment validation** and classify each variable as required, recommended, optional, or bootstrap-only; ensure no secret value is committed.
- [ ] **Step 2: Verify database connectivity/migrations** using the transaction-pooler `DATABASE_URL` and migration-capable `DIRECT_URL` pattern already documented.
- [ ] **Step 3: Verify Supabase `audio` and `covers` buckets** support public reads and service-role writes by executing a real upload/playback smoke flow.
- [ ] **Step 4: Verify Stripe checkout/webhook configuration, Resend sender/email verification, cron authorization, Redis connectivity, and worker startup.**
- [ ] **Step 5: Verify optional-service degradation:** PostHog, Sentry, Redis-dependent noncritical jobs, recommendations, and 3D must not take down core navigation/auth/catalog playback.
- [ ] **Step 6: Run `npm run env:check`, `npm run secrets:check`, `npm run reliability:smoke`, `npm run reliability:auth-smoke`, and worker health checks.**
- [ ] **Step 7: Commit:** `git commit -am "ops: complete production infrastructure checks"`.

### Task 9: Full release verification and production smoke

**Files:**
- Modify: `docs/release/release-gate.md`
- Modify: `docs/RELEASE_NOTES.md`
- Modify: `CHECKLIST.md`

**Interfaces:**
- Consumes: all previous task deliverables.
- Produces: auditable go/no-go record and release notes.

- [ ] **Step 1: Run the complete local gate:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run preflight`, `npm run secrets:check`.
- [ ] **Step 2: Run browser journeys** for anonymous home/discover, signup/sign-in, Studio upload/publish, playback, marketplace purchase, dashboard, pricing/checkout, and representative error/empty states.
- [ ] **Step 3: Deploy a preview candidate** and run `npm run smoke`, `npm run reliability:smoke`, `npm run reliability:auth-smoke`, and `npm run perf:budget` against it where scripts support target URLs.
- [ ] **Step 4: Perform visual QA** at mobile/tablet/laptop/desktop sizes on the homepage, discovery, marketplace, track, artist, auth, Studio, dashboard, pricing, support, legal, 404, and error surfaces.
- [ ] **Step 5: Mark every release gate pass/fail with evidence.** Any red critical gate blocks production; do not reinterpret a failure as acceptable without an explicit product decision.
- [ ] **Step 6: Promote the verified candidate to production and repeat core smoke checks against the canonical domain.**
- [ ] **Step 7: Update release notes and completion checklist** with the deployed commit SHA and any external configuration still requiring owner action.
- [ ] **Step 8: Commit:** `git commit -am "chore: record production release verification"`.

## Self-review

- Spec coverage: public Black Label UI, Studio, auth/onboarding, commerce/playback, responsive/accessibility/performance/SEO, infrastructure, workers, storage, observability, and deployment are all assigned to explicit tasks.
- No release-critical task permits placeholder functionality; unavailable controls must be removed or explicitly disabled.
- Shared interfaces are ordered: release inventory -> design system -> public/auth/Studio flows -> commerce -> hardening -> infrastructure -> release verification.

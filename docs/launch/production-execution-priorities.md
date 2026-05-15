# EMS Production Execution Priorities

## Purpose

This plan converts the EMS roadmap back into production execution. The platform has a large product architecture map, but the next launch-critical work must harden the actual user-facing product.

## Execution Order

### 1. Finish Studio architecture

The Studio must become the core product moat. The production target is a DAW-style workspace with stable screen switching, visible outer-window scrolling, true horizontal and vertical navigation, reliable transport controls, mode-specific full screens, saved layouts, autosave recovery, profiler-safe rendering, and panel-level error boundaries.

Required work:

- Pro Tools-style browser-window scroll behavior.
- Mode screens for Studio, Edit, Mix, Beat, Collab, Export, Mastering, and Live.
- Workspace launcher cards.
- Sticky transport.
- Sticky mode rail.
- Saved layout presets.
- Safe mode fallback.
- Error boundaries around heavy panels.
- Playwright tests proving mode buttons work.
- Playwright tests proving vertical and horizontal scroll work.

### 2. Fix UX, scroll, and layout instability

The global UI must stop trapping the user inside nested boxes. Every page should expose clear navigation, predictable scrolling, visible actions, and stable responsive layouts.

Required work:

- Audit all overflow-hidden containers.
- Add global page scroll tests.
- Normalize app shell width and height behavior.
- Add mobile bottom nav globally.
- Add unified main menu globally.
- Add command/search navigation.
- Add route-level loading states.
- Add empty states and disabled-state explanations.
- Add visual regression coverage for Studio, Listening Sessions, Dashboard, Marketplace, and Pricing.

### 3. Finish auth and collaboration graph

EMS needs a real creator identity layer before advanced ecosystem features can work.

Required work:

- Creator profiles.
- Workspace ownership.
- Team roles.
- Collaboration invites.
- Project membership.
- Permissions model.
- Creator reputation scaffolding.
- Supabase RLS verification.
- Authenticated QA flow.

### 4. Finish marketplace and payments

The monetization layer must become operational, not conceptual.

Required work:

- Marketplace listings.
- Beat/license/service categories.
- Stripe checkout flow.
- Subscription tiers.
- Creator payouts plan.
- License tier UI.
- Purchase history.
- Revenue dashboard.
- Payment webhooks.
- Refund and dispute documentation.

### 5. Finish listening sessions

Listening sessions need one canonical destination and a working live-room flow.

Required work:

- Canonical /listening-sessions route.
- Redirect /rooms and /studio/live into the canonical experience.
- LiveKit environment verification.
- Create room.
- Join room.
- Host controls.
- Audience chat.
- Raise hand.
- Tipping hooks.
- Session replay plan.
- Session analytics.

### 6. Deploy AI infrastructure

AI should support real workflows first: Studio help, launch assistance, recommendations, repair intelligence, and creator workflow memory.

Required work:

- OpenAI environment setup verification.
- AI assistant API route tests.
- Studio assistant panel.
- Marketplace recommendations scaffold.
- Creator workflow memory plan.
- Sentry ingestion.
- Guardian incident summaries.
- Anomaly scoring.

### 7. Build mobile layer

Mobile should prioritize navigation, listening sessions, marketplace, notifications, and light Studio controls before attempting a full mobile DAW.

Required work:

- Mobile bottom nav.
- Mobile-safe page layouts.
- PWA metadata.
- Touch scrolling.
- Mobile Studio launcher.
- Mobile session join flow.
- Mobile marketplace browsing.
- Push notification plan.

### 8. Expand metaverse layer

Only after the core platform is stable should EMS expand into virtual city districts.

Required work:

- Downtown Prime landing route.
- District cards.
- Studio storefronts.
- Event arena route.
- Sponsor inventory map.
- Lightweight 3D performance budget.
- Fallback 2D district mode.

## Launch Rule

Do not expand abstract architecture until the production product passes these gates:

- Studio mode switching works.
- Studio scroll works vertically and horizontally.
- Main menu routes work.
- Listening Sessions has one canonical flow.
- Marketplace can show purchasable offers.
- Authenticated user flow works.
- Build, typecheck, and production deployment pass.
- Visual regression and route smoke tests pass.

## Current Priority

Immediate next patch: repair Studio, navigation, scrolling, and user-facing route clarity before adding more conceptual maps.

# 🚀 EMS — PHASE 2 MASTER BUILD

**Phase 2 Goal:** Scale from 0 → 1K users by activating the viral growth loop:
Invite friends → earn badges → battle on Versus → share "WHO WON?" → more signups

---

## ✅ Already Complete (from Phase 1 + previous sessions)

- [x] Auth system (register/signin with Google OAuth + credentials)
- [x] Studio profiles + music upload
- [x] Versus battle system + voting
- [x] Marketplace with Stripe checkout
- [x] City districts (Indie Blocks / Downtown Prime / Label Row)
- [x] Leaderboard / charts
- [x] Label system (sign artists)
- [x] AI scoring engine
- [x] Notifications
- [x] Social follow system
- [x] Dashboard with earnings, licenses, analytics
- [x] Subscription tiers (Starter / Pro / Prime)
- [x] Ad placements
- [x] Create Battle UI on /versus for artists

---

## 🔨 Phase 2 Build Steps

### STEP 1 — Schema Extensions
Add to Prisma schema:
- `InviteCode` model — unique invite codes per user, tracks who used them
- `UserBadge` model — achievement badges earned by users
- `BadgeType` enum — EARLY_ADOPTER, INVITE_5, INVITE_10, INVITE_50, FIRST_BATTLE_WIN, FIRST_LICENSE_SOLD, LICENSE_HOLDER, TOP_ARTIST
- `Studio.level` field (Int, default 1) — unlocked by activity milestones
- Relations on User: `inviteCodesCreated`, `inviteCodeUsed`, `badges`

### STEP 2 — Invite Engine API
- `GET /api/invite` — returns caller's invite code (creates one if none exists)
- `POST /api/invite/use` — validates a code and marks it used (called from register flow)
- Update `POST /api/auth/register` — accept optional `inviteCode`; credit inviter; auto-award milestone badges (INVITE_5, INVITE_10, INVITE_50) based on total uses

### STEP 3 — Badge Award Logic
Utility function `awardBadge(userId, type)` — idempotent, checks `@@unique([userId, type])`.
Wire to:
- Register handler: EARLY_ADOPTER (first 1 000 users), LICENSE_HOLDER (first purchase)
- Versus vote route: FIRST_BATTLE_WIN (winner's artist when match completes)
- Song create route: (noop — will fire when first license sold)
- Checkout webhook: FIRST_LICENSE_SOLD (artist), LICENSE_HOLDER (buyer)

### STEP 4 — /invite page
Artist-facing page showing:
- Their unique invite link (copy-to-clipboard)
- Progress bar toward next milestone (5 / 10 / 50)
- Reward list with locked/unlocked state
- How-to instructions

### STEP 5 — /versus/[id] "WHO WON?" page
Public result page for a VersusMatch showing:
- Song A vs Song B cover art + names
- Final vote counts + winner crown
- "Share the results" — copy link + Twitter/X intent URL
- CTA to sign up or browse battles

### STEP 6 — Dashboard enhancements
- Invite progress widget (invite link + uses + milestone badges)
- Badges showcase section (earned vs locked)

### STEP 7 — Studio profile enhancements
- Display Studio.level badge
- Show earned badges on public studio page

---

## 🗄️ New DB Models

```prisma
model InviteCode {
  id          String    @id @default(cuid())
  code        String    @unique
  createdAt   DateTime  @default(now())
  usedAt      DateTime?

  createdById String
  createdBy   User      @relation("InviteCreator", fields: [createdById], references: [id])

  usedById    String?   @unique
  usedBy      User?     @relation("InviteUsed", fields: [usedById], references: [id])
}

model UserBadge {
  id        String    @id @default(cuid())
  type      BadgeType
  awardedAt DateTime  @default(now())

  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, type])
}

enum BadgeType {
  EARLY_ADOPTER
  INVITE_5
  INVITE_10
  INVITE_50
  FIRST_BATTLE_WIN
  FIRST_LICENSE_SOLD
  LICENSE_HOLDER
  TOP_ARTIST
}
```

---

## 🎁 Milestone Reward Map

| Invites | Badge Unlocked | Perk |
|---------|---------------|------|
| 5       | INVITE_5      | Billboard credit unlocked |
| 10      | INVITE_10     | Premium studio badge |
| 50      | INVITE_50     | Prime plan upgrade credit |

---

## 📋 File Checklist

| File | Action |
|------|--------|
| `packages/db/prisma/schema.prisma` | Add InviteCode, UserBadge, BadgeType, Studio.level |
| `packages/db/prisma/migrations/...` | New migration SQL |
| `apps/web/src/lib/badges.ts` | `awardBadge()` utility |
| `apps/web/src/app/api/invite/route.ts` | GET invite code |
| `apps/web/src/app/api/invite/use/route.ts` | POST use invite code |
| `apps/web/src/app/api/auth/register/route.ts` | Accept inviteCode param |
| `apps/web/src/app/invite/page.tsx` | Invite dashboard page |
| `apps/web/src/app/versus/[id]/page.tsx` | WHO WON result page |
| `apps/web/src/app/dashboard/page.tsx` | Add invite widget + badges |
| `apps/web/src/app/studio/[username]/page.tsx` | Show level + badges |
| `apps/web/src/components/Navbar.tsx` | Add /invite link |

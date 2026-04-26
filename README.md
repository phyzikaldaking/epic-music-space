# 🎵 Epic Music Space

**Digital Music Licensing + Revenue Participation Platform**

Independent artists release limited digital licenses for their music. Fans and supporters purchase those licenses and receive a contractually defined share of the song's streaming revenue — forever.

> **Legal note:** EMS licenses are digital content licenses, not securities, investment contracts, or equity instruments. They do not fall under SEC jurisdiction. See [Licensing Agreement](/apps/web/src/app/legal/licensing/page.tsx).

---

## 🏗️ Architecture

This is a **Turborepo monorepo** with npm workspaces.

```
epic-music-space/
├── apps/
│   ├── web/                  # Next.js 15 app (App Router, TypeScript, Tailwind)
│   ├── api/                  # Standalone Hono REST API (@ems/api)
│   └── credit-care/          # Credit Care app workspace (@creditcare/app)
├── packages/
│   ├── db/                   # Prisma schema + generated client (@ems/db)
│   ├── ui/                   # Shared React components (@ems/ui)
│   └── utils/                # Shared utilities (@ems/utils)
├── turbo.json
└── package.json
```

## 🧩 Multi-Entity Separation

This repo now enforces a clean separation between:

- **Epic Music Space (EMS)** — music licensing product
- **Credit Care** — separate product and legal entity

Even when infrastructure is shared (for example, payments or banking operations), product-domain code must remain isolated by workspace. See [`docs/ENTITY_SEPARATION.md`](./docs/ENTITY_SEPARATION.md).

## 📦 Tech Stack

| Layer      | Technology                                            |
| ---------- | ----------------------------------------------------- |
| Framework  | Next.js 15 (App Router, React Server Components)      |
| API        | Hono (standalone REST server — `apps/api`)            |
| Auth       | NextAuth.js v5 (Credentials + Google OAuth)           |
| Database   | PostgreSQL + Prisma ORM                               |
| Payments   | Stripe Checkout + Webhooks + Subscriptions            |
| Caching    | Redis (ioredis) — graceful fallback to memory         |
| Jobs       | BullMQ workers (AI scoring, notifications, analytics) |
| Rate Limit | rate-limiter-flexible (Redis or in-memory)            |
| AI         | OpenAI GPT-4o (song analysis + scoring)               |
| Styling    | Tailwind CSS v3                                       |
| Build      | Turborepo + npm workspaces                            |
| Language   | TypeScript (strict)                                   |

## 🗄️ Database Schema

- **User** — accounts with `LISTENER | ARTIST | ADMIN` roles
- **Song** — music catalog with license pricing + revenue share config
- **LicenseToken** — each purchased license, numbered 1…N
- **Transaction** — all payment records (Stripe-linked)
- **Payout** — quarterly revenue distributions

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm 11+
- PostgreSQL database (Supabase / Neon / Railway / local Docker)
- Stripe account
- Google OAuth app (optional)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in DATABASE_URL, AUTH_SECRET, STRIPE keys, etc.
```

### 3. Run database migrations

```bash
cd packages/db
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Start development

```bash
npm run dev
# → http://localhost:3000
```

## 🚢 Deployment

The web app is configured for Vercel through `vercel.json`.

```bash
# Build the deployable app and standalone API
npm run build

# Build only the deployable Next.js app
npm run build:web

# Apply production Prisma migrations when you are ready to change the DB
npm run db:deploy
```

Vercel runs `npm run vercel:build`, which generates the Prisma client and
builds `apps/web`. Database migrations are explicit so preview deployments do
not fail or mutate production data during the build step.

## 🔌 API Routes

| Method | Path                      | Description                          |
| ------ | ------------------------- | ------------------------------------ |
| GET    | `/api/songs`              | List all active songs                |
| POST   | `/api/songs`              | Create a song (artists only)         |
| POST   | `/api/checkout`           | Create Stripe checkout session       |
| POST   | `/api/webhooks/stripe`    | Stripe webhook (license fulfillment) |
| POST   | `/api/auth/register`      | Register new user                    |
| \*     | `/api/auth/[...nextauth]` | NextAuth.js handlers                 |

## 📄 Legal Pages

- `/legal/terms` — Terms of Service
- `/legal/privacy` — Privacy Policy
- `/legal/licensing` — Digital Music Licensing Agreement

## 🛣️ Roadmap

- [x] **Phase 1** — Infrastructure: auth, database, payments, legal framework
- [x] **Phase 2** — Economy: Versus battle system, city districts, studio profiles, label system, ad placements, leaderboards
- [x] **Phase 3** — AI layer: song sentiment scoring, personalized license recommendations, AI chat assistant, real-time notifications, follow/social graph
- [x] **Phase 4** — Scalability: Redis caching (ioredis), BullMQ background workers (AI scoring, notifications, analytics), rate limiting (rate-limiter-flexible), Stripe subscription tiers (Starter / Pro / Prime / Label), billing portal

---

_Epic Music Space, LLC — All rights reserved._

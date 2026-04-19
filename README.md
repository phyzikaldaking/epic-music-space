# Epic Music Space (EMS)

> **The digital city where artists own studios, buy visibility, and compete for attention.**

---

## What is EMS?

EMS is a **monetized attention economy** built for musicians — not a streaming platform, not a social media app.

- 🏙 **Digital Real Estate** — Artists own studios (profile pages) in a virtual city
- 📣 **Billboard System** — Paid visibility placements with scarcity pricing
- 💰 **Direct Monetization** — Beats, services, and ticketed events
- 🏆 **Competitive Marketplace** — Artists compete for attention in district zones

---

## City Districts

| District | Tier | Description |
|---|---|---|
| Downtown Prime | Premium | Highest visibility, most expensive |
| Producer Alley | Mid-tier | Mid-range placement |
| Underground | Free | Entry-level, default |
| VIP Towers | Exclusive | Invite-only premium |

---

## Subscription Tiers

| Plan | Price | Benefits |
|---|---|---|
| Starter | $9/mo | Basic studio, Underground district |
| Pro | $29/mo | Billboard access, Producer Alley |
| Prime | $99+/mo | Full features, Downtown/VIP access |

---

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind CSS
- **Backend**: Supabase + Prisma ORM
- **Payments**: Stripe + Stripe Connect (15% platform fee)
- **3D City**: Three.js
- **Hosting**: Vercel
- **Analytics**: PostHog

---

## Monorepo Structure

```
/apps
  /web          Next.js frontend
/packages
  /db           Prisma ORM schema + client
  /ui           Shared React components
  /config       Shared ESLint + TypeScript configs
  /payments     Stripe + Stripe Connect helpers
  /game         Three.js 3D city engine
/prisma
```

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp apps/web/.env.example apps/web/.env.local

# Run database migrations
cd packages/db && pnpm prisma migrate dev

# Start dev server
pnpm dev
```

---

## Design System

| Token | Value | Usage |
|---|---|---|
| `ems-black` | `#0A0A0F` | Background |
| `ems-gold` | `#D4AF37` | Primary CTA |
| `ems-purple` | `#7B3FE4` | Accent / secondary |

**Fonts**: Sora (headings) · Inter (body)  
**Style**: Neon · Futuristic · Luxury tech

---

## Revenue Model

1. **Subscriptions** — Recurring monthly revenue
2. **Billboard Ads** — Weekly placements, scarcity pricing, auction system
3. **Marketplace** — Beats, mixing/mastering (10–15% platform fee)
4. **Events** — Ticketed listening sessions and album drops
5. **Whale Deals** — Labels, brands, influencers ($5K–$25K/month)

---

*EMS — The NASDAQ of music attention.*

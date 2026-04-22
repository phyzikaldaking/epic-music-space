# @ems/api

Standalone REST API server for Epic Music Space.

Built with [Hono](https://hono.dev) — lightweight, TypeScript-first, edge-compatible.

## Routes

| Method | Path                   | Auth      | Description                                             |
| ------ | ---------------------- | --------- | ------------------------------------------------------- |
| `GET`  | `/health`              | —         | Health check                                            |
| `GET`  | `/api/market/listings` | —         | Return all active song listings with available licenses |
| `POST` | `/api/market/buy`      | ✅ Bearer | Create a Stripe checkout session to buy a song license  |
| `POST` | `/api/song/upload`     | ✅ Bearer | Register a newly uploaded song (artist only)            |
| `POST` | `/api/versus/vote`     | ✅ Bearer | Cast or update a vote in a versus match                 |

> **Note:** The same routes also exist as Next.js API routes in `apps/web/src/app/api/` for use by the Next.js frontend. `apps/api` is a separately deployable service for external integrations.

## Development

```bash
# From repo root
npm run dev
# or start only this service
cd apps/api && npm run dev
```

The server starts on `http://localhost:3001` by default (`PORT` env var).

## Authentication

Every protected route expects a `Authorization: Bearer <supabase-jwt>` header.
The JWT is validated against the Supabase Auth API configured via
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

In development (when Supabase is not configured) you can pass
`x-ems-user-id: <any-user-id>` to bypass auth.

## Environment Variables

Copy `.env.example` to `.env`:

```
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
STRIPE_SECRET_KEY=
REDIS_URL=
NEXT_PUBLIC_APP_URL=
PORT=3001
```

## Deployment

This service can be deployed as:

- **Standalone Node.js process** — `npm run build && npm run start`
- **Docker container** — `FROM node:20-alpine`, build → start
- **Vercel Serverless** — export `app.fetch` from `src/index.ts` and configure a Vercel project pointing to this app

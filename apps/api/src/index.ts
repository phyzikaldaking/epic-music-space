/**
 * @ems/api — Epic Music Space standalone REST API
 *
 * Routes:
 *   GET  /api/market/listings  — return all active song listings
 *   POST /api/market/buy       — buy licenses for a song (Stripe checkout)
 *   POST /api/song/upload      — register an uploaded song (artist only)
 *   POST /api/versus/vote      — cast/update a versus match vote
 *
 * This server is deployed as a standalone Hono HTTP service and can run on
 * Node.js (production) or as a Vercel Edge Function via @hono/node-server.
 *
 * Authentication is handled via a Supabase JWT Bearer token.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { marketRouter } from "./routes/market";
import { songsRouter } from "./routes/songs";
import { versusRouter } from "./routes/versus";

// ─────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────

const app = new Hono();

// ── Global middleware ──────────────────────────────────────────────────────

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: [
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "http://localhost:3000",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-ems-user-id"],
    maxAge: 86400,
  })
);

// ── Health check ───────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ status: "ok", service: "@ems/api", timestamp: new Date().toISOString() })
);

// ── Route mounts ───────────────────────────────────────────────────────────

app.route("/api/market", marketRouter);
app.route("/api/song", songsRouter);
app.route("/api/versus", versusRouter);

// ── 404 fallback ───────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("[api] Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ─────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3001", 10);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.info(`[api] @ems/api listening on http://localhost:${info.port}`);
});

export default app;

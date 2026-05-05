/**
 * @ems/api — Epic Music Space standalone REST API
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { marketRouter } from "./routes/market";
import { songsRouter } from "./routes/songs";
import { versusRouter } from "./routes/versus";
import { csrfMiddleware } from "./middleware/csrf";

const app = new Hono();

app.use("*", logger());

const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [process.env.NEXT_PUBLIC_APP_URL ?? "https://epicmusicspace.com"]
    : ["http://localhost:3000"];

app.use("*", cors({ origin: allowedOrigins }));

// 🔒 ADD CSRF PROTECTION
app.use("*", csrfMiddleware);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/market", marketRouter);
app.route("/api/song", songsRouter);
app.route("/api/versus", versusRouter);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

serve({ fetch: app.fetch, port: 3001 });

export default app;

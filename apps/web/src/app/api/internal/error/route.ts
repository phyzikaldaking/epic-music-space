import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/authIdentity";
import { rateLimit } from "@/lib/rateLimitInline";
import { page } from "@/lib/pager";

export const runtime = "nodejs";

const errorPayloadSchema = z.object({
  message: z.string().trim().min(1).max(300).optional(),
  digest: z.string().trim().max(200).optional(),
  stack: z.string().max(4_000).optional(),
  href: z.string().url().max(1_000).optional(),
});

/**
 * Lightweight error sink. global-error.tsx and component-level error
 * boundaries POST here. We log to stderr (so they show up in Vercel Runtime
 * Logs) and best-effort forward to AUTH_ALERT_WEBHOOK_URL (Slack/Discord
 * compatible) so unhandled exceptions actually surface in chat.
 */
export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  const origin = req.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Heavy rate limit so a buggy page doesn't fan us out. Use the same
  // trusted-IP resolution as auth flows rather than raw x-forwarded-for.
  const ip = getClientIp(req.headers);
  const blocked = await rateLimit("lenient", `err:${ip}`);
  if (blocked) return blocked;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Invalid content type" }, { status: 415 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = errorPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const body = parsed.data;

  console.error("[global-error]", {
    message: body.message,
    digest: body.digest,
    href: body.href,
    stack: body.stack?.slice(0, 2000),
  });

  // Forward to Sentry if configured. We synthesize an Error so the stack
  // trace and message land in the right buckets.
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      const err = new Error(body.message ?? "client global-error");
      if (body.stack) err.stack = body.stack;
      const Sentry = await import("@sentry/core");
      Sentry.captureException(err, {
        tags: { source: "client-global-error" },
        extra: { digest: body.digest, href: body.href },
      });
    } catch {
      /* ignore Sentry capture failures */
    }
  }

  page({
    severity: "error",
    title: `global-error: ${body.message?.slice(0, 200) ?? "unknown"}`,
    body: body.stack?.slice(0, 1000),
    context: { href: body.href, digest: body.digest },
    fingerprint: body.digest,
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimitInline";
import { page } from "@/lib/pager";

export const runtime = "nodejs";

/**
 * Lightweight error sink. global-error.tsx and component-level error
 * boundaries POST here. We log to stderr (so they show up in Vercel Runtime
 * Logs) and best-effort forward to AUTH_ALERT_WEBHOOK_URL (Slack/Discord
 * compatible) so unhandled exceptions actually surface in chat.
 */
export async function POST(req: Request) {
  // Heavy rate limit so a buggy page doesn't fan us out
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const blocked = await rateLimit("lenient", `err:${ip}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    digest?: string;
    stack?: string;
    href?: string;
  };

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

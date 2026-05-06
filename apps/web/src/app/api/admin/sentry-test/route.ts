import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sentry-test — admin-only Sentry capture verification.
 *
 * `?mode=message` (default) sends a captureMessage and returns the
 * Sentry event ID so you can confirm it landed in the dashboard
 * without crashing the route.
 *
 * `?mode=throw` throws an Error after captureException so the host
 * can verify both manual capture AND the global error handler are
 * wired. The thrown error is intentional — Sentry should report it
 * as a 500.
 *
 * Either mode is a no-op (returns 503) if SENTRY_DSN isn't set, so
 * dev environments don't accidentally generate fake events.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return NextResponse.json(
      { ok: false, message: "SENTRY_DSN not set on this deploy. Capture is a no-op." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "throw" ? "throw" : "message";
  const tag = `admin-sentry-test-${Date.now()}`;

  if (mode === "throw") {
    Sentry.captureException(new Error(`[sentry-test] thrown by admin ${session.user.id} (${tag})`));
    await Sentry.flush(2_000).catch(() => null);
    throw new Error(`[sentry-test] intentional throw — tag=${tag}`);
  }

  const eventId = Sentry.captureMessage(
    `[sentry-test] ping by admin ${session.user.id} (${tag})`,
    "info",
  );
  await Sentry.flush(2_000).catch(() => null);

  return NextResponse.json({
    ok: true,
    mode,
    eventId,
    tag,
    note: "Check your Sentry project — search by the tag above.",
  });
}

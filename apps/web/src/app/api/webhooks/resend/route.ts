import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Resend webhook receiver.
 * Handles bounce and complaint events to suppress future sends.
 *
 * Set RESEND_WEBHOOK_SECRET in env (Resend dashboard → Webhooks → signing secret).
 * Endpoint: POST /api/webhooks/resend
 *
 * Events handled:
 *  - email.bounced     → mark emailBounced=true, suppress outbox rows
 *  - email.complained  → mark emailBounced=true (ISP complaint = treat as bounce)
 */

async function verifyResendSignature(req: NextRequest, body: string): Promise<boolean> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[resend-webhook] RESEND_WEBHOOK_SECRET not set — skipping signature check");
    return true; // allow in dev; fail closed in prod via env discipline
  }

  const svix_id = req.headers.get("svix-id") ?? "";
  const svix_ts = req.headers.get("svix-timestamp") ?? "";
  const svix_sig = req.headers.get("svix-signature") ?? "";

  if (!svix_id || !svix_ts || !svix_sig) return false;

  // Resend uses svix under the hood
  const toSign = `${svix_id}.${svix_ts}.${body}`;
  const computed = createHmac("sha256", secret).update(toSign).digest("base64");
  const expected = `v1,${computed}`;

  // svix-signature may contain multiple space-separated sigs
  const sigs = svix_sig.split(" ");
  return sigs.some((s) => {
    try {
      return timingSafeEqual(Buffer.from(s), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const valid = await verifyResendSignature(req, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { type: string; data?: { email?: { to?: string[] } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType: string = payload?.type ?? "";
  const toAddresses: string[] = payload?.data?.email?.to ?? [];

  if (!["email.bounced", "email.complained"].includes(eventType)) {
    // Acknowledge unknown events — don't retry
    return NextResponse.json({ ok: true, ignored: true });
  }

  let updated = 0;

  for (const address of toAddresses) {
    const email = address.toLowerCase().trim();
    if (!email) continue;

    // Suppress user
    const result = await prisma.user.updateMany({
      where: { email, emailBounced: false },
      data: { emailBounced: true, emailBouncedAt: new Date() },
    });
    updated += result.count;

    // Suppress pending outbox rows for this address
    await prisma.emailOutbox.updateMany({
      where: { to: email, status: "PENDING" },
      data: { status: "SUPPRESSED" },
    });

    // Log the action
    await prisma.adminActionLog.create({
      data: {
        adminId: "system",
        adminEmail: "system",
        action: eventType === "email.bounced" ? "email.bounce" : "email.complaint",
        target: email,
        metadata: { event: eventType },
      },
    });
  }

  return NextResponse.json({ ok: true, updated });
}

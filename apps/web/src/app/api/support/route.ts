import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { sendSupportConfirmation } from "@/lib/email";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(100).optional(),
  subject: z.string().min(3).max(200),
  body: z.string().min(10).max(5000),
});

function makeTicketCode(): string {
  // EMS-XXXX where XXXX is 4 hex chars uppercase. Short + greppable.
  return `EMS-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`support:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Generate a unique code; collision odds are tiny but retry once just in case.
  let ticketCode = makeTicketCode();
  for (let i = 0; i < 3; i++) {
    const existing = await prisma.supportTicket.findUnique({ where: { ticketCode } });
    if (!existing) break;
    ticketCode = makeTicketCode();
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      ticketCode,
      email: parsed.data.email.trim().toLowerCase(),
      name: parsed.data.name ?? null,
      subject: parsed.data.subject,
      body: parsed.data.body,
      userId: session?.user?.id ?? null,
      ip,
    },
  });

  // Best-effort autoresponder + alert webhook fan-out.
  void (async () => {
    try {
      await sendSupportConfirmation({
        to: ticket.email,
        name: ticket.name,
        ticketCode: ticket.ticketCode,
        subject: ticket.subject,
      });
    } catch (err) {
      console.warn("[support] autoresponder failed", err);
    }

    const webhook = process.env.AUTH_ALERT_WEBHOOK_URL;
    if (webhook) {
      void fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `📬 New support ticket [${ticket.ticketCode}] — ${ticket.subject}\nFrom: ${ticket.email}\n${ticket.body.slice(0, 400)}${ticket.body.length > 400 ? "…" : ""}`,
        }),
      }).catch(() => {});
    }
  })();

  return NextResponse.json(
    { ok: true, ticketCode: ticket.ticketCode },
    { status: 201 },
  );
}

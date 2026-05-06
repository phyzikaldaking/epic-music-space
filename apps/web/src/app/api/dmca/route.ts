import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { isLikelyBot } from "@/lib/botCheck";

export const runtime = "nodejs";

const schema = z.object({
  complainantName: z.string().min(2).max(200),
  complainantEmail: z.string().email(),
  complainantAddress: z.string().min(5).max(500),
  copyrightedWork: z.string().min(5).max(1000),
  infringingUrl: z.string().url().max(500),
  goodFaithStatement: z.literal(true),
  perjuryStatement: z.literal(true),
  signature: z.string().min(2).max(200),
});

/**
 * POST /api/dmca — receive a DMCA takedown notice and forward it to the
 * Designated Agent inbox. Strict per-IP limiter so the form can't be used
 * to flood the inbox. Best-effort send via Resend if configured; falls
 * through to a server log otherwise so the notice isn't silently dropped.
 *
 * IMPORTANT: nothing here decides the merits of the notice. A human
 * Designated Agent reviews each one before any takedown action.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`dmca:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many submissions. Email dmca@epicmusicspace.com directly." },
      { status: 429 },
    );
  }

  // BotID — DMCA submissions are a high-leverage attack surface (false
  // notices can trigger downstream takedowns + § 512(f) liability for the
  // submitter). Reject obvious bot traffic before we forward to the agent
  // inbox. Soft-fails open if BotID is misconfigured so a real user with
  // a copyright claim is never locked out by infrastructure.
  if (await isLikelyBot({ headers: req.headers, allowBrowserFallback: false })) {
    return NextResponse.json(
      { error: "Couldn't verify the request. Email dmca@epicmusicspace.com directly." },
      { status: 403 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const n = parsed.data;

  const subject = `DMCA Notice — ${n.complainantName}`;
  const html = `<h2>DMCA Takedown Notice</h2>
<table cellpadding="6" style="font-family:system-ui;font-size:14px">
  <tr><td><strong>Complainant</strong></td><td>${escapeHtml(n.complainantName)} &lt;${escapeHtml(n.complainantEmail)}&gt;</td></tr>
  <tr><td><strong>Address</strong></td><td>${escapeHtml(n.complainantAddress)}</td></tr>
  <tr><td><strong>Copyrighted work</strong></td><td>${escapeHtml(n.copyrightedWork)}</td></tr>
  <tr><td><strong>Infringing URL</strong></td><td><a href="${escapeAttr(n.infringingUrl)}">${escapeHtml(n.infringingUrl)}</a></td></tr>
  <tr><td><strong>Good-faith statement</strong></td><td>Affirmed</td></tr>
  <tr><td><strong>Perjury statement</strong></td><td>Affirmed under penalty of perjury</td></tr>
  <tr><td><strong>Signature</strong></td><td>/s/ ${escapeHtml(n.signature)}</td></tr>
  <tr><td><strong>Submitted from IP</strong></td><td>${escapeHtml(ip)}</td></tr>
  <tr><td><strong>Received</strong></td><td>${new Date().toISOString()}</td></tr>
</table>`;

  try {
    const { Resend } = await import("resend");
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Epic Music Space <noreply@epicmusicspace.com>",
        to: process.env.DMCA_AGENT_EMAIL ?? "dmca@epicmusicspace.com",
        replyTo: n.complainantEmail,
        subject,
        html,
      });
    } else {
      console.warn("[dmca] RESEND_API_KEY missing — notice logged but not emailed", n);
    }
  } catch (err) {
    console.error("[dmca] forward failed", err);
    // We deliberately don't fail the request — losing the email shouldn't
    // make the complainant think their notice didn't arrive. The server log
    // remains the audit trail of last resort.
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

import { Resend } from "resend";
import { getSiteUrl } from "./site";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM ?? "Epic Music Space <noreply@epicmusicspace.com>";

export async function sendPasswordResetEmail(email: string, token: string) {
  const base = getSiteUrl();
  const url = `${base}/auth/reset?token=${encodeURIComponent(token)}`;

  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] Password reset email blocked in production — RESEND_API_KEY not set");
      return { ok: false, error: { code: "EMAIL_PROVIDER_NOT_CONFIGURED" } };
    }
    console.warn("[email] RESEND_API_KEY not set — password reset link below");
    console.info(`[email] Password reset URL: ${url}`);
    return { ok: true, dev: true, url };
  }

  const html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:-apple-system,sans-serif;padding:40px 16px">
    <div style="max-width:540px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px">
      <h1 style="margin:0 0 12px;font-size:24px">Reset your password</h1>
      <p style="color:rgba(255,255,255,0.7);line-height:1.6">Click the button below to set a new password. This link expires in 30 minutes.</p>
      <p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700">Reset password →</a></p>
      <p style="color:rgba(255,255,255,0.45);font-size:12px;line-height:1.5">If you didn't request this, ignore this email — your password won't change.</p>
    </div></body></html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Reset your Epic Music Space password",
    html,
    text: `Reset your password: ${url}\n\nLink expires in 30 minutes.`,
  });
  if (error) {
    console.error("[email] Password reset send failed", error);
    return { ok: false, error };
  }
  return { ok: true };
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  callbackUrl?: string,
) {
  const base = getSiteUrl();
  const callbackParam = callbackUrl
    ? `&callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "";
  const url = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}${callbackParam}`;

  if (!resend) {
    const missingProviderError = {
      code: "EMAIL_PROVIDER_NOT_CONFIGURED",
      message: "RESEND_API_KEY is not configured.",
    };

    if (process.env.NODE_ENV === "production") {
      console.error("[email] Verification email blocked in production", missingProviderError);
      return { ok: false, error: missingProviderError };
    }

    console.warn("[email] RESEND_API_KEY not set — skipping verification email");
    console.info(`[email] Verification URL: ${url}`);
    return { ok: true, dev: true, url };
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Verify your Epic Music Space email",
    html: buildVerificationHtml(url),
    text: `Verify your email by visiting: ${url}\n\nThis link expires in 24 hours.`,
  });

  if (error) {
    console.error("[email] Send failed", error);
    return { ok: false, error };
  }

  return { ok: true };
}

interface MilestoneEmail {
  to: string;
  artistName: string;
  kind: "first_sale" | "first_follower" | "first_tip";
  amountUsd?: number;
  songTitle?: string;
  followerName?: string;
}

const MILESTONE_COPY: Record<MilestoneEmail["kind"], { subject: (m: MilestoneEmail) => string; heading: string; emoji: string }> = {
  first_sale: {
    subject: (m) => `🎉 Your first sale on Epic Music Space — $${m.amountUsd?.toFixed(2) ?? "0.00"}`,
    heading: "You just made your first sale.",
    emoji: "💸",
  },
  first_follower: {
    subject: () => `🎤 You've got your first follower on Epic Music Space`,
    heading: "Someone just hit follow.",
    emoji: "🎤",
  },
  first_tip: {
    subject: (m) => `❤️ Your first tip on Epic Music Space — $${m.amountUsd?.toFixed(2) ?? "0.00"}`,
    heading: "A fan just tipped you.",
    emoji: "❤️",
  },
};

/**
 * Sends a one-time milestone email to an artist. Best-effort: returns ok=false
 * with a code instead of throwing so callers can fire-and-forget.
 */
export async function sendArtistMilestoneEmail(m: MilestoneEmail) {
  const copy = MILESTONE_COPY[m.kind];
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] Milestone email blocked — RESEND_API_KEY not set", m.kind);
      return { ok: false, error: "EMAIL_PROVIDER_NOT_CONFIGURED" };
    }
    console.info("[email] (dev) milestone:", m);
    return { ok: true, dev: true };
  }
  const base = getSiteUrl();
  const detail =
    m.kind === "first_sale"
      ? `<strong>${m.songTitle ?? "your track"}</strong> just sold its first license for <strong>$${m.amountUsd?.toFixed(2) ?? "0.00"}</strong>. The buyer's payment landed in your Stripe Connect balance — payouts run every Monday.`
      : m.kind === "first_tip"
        ? `<strong>${m.followerName ?? "A fan"}</strong> sent you <strong>$${m.amountUsd?.toFixed(2) ?? "0.00"}</strong>. The full amount (minus Stripe processing) lands in your Connect balance.`
        : `<strong>${m.followerName ?? "A new fan"}</strong> followed you. They'll see new uploads and posts on their feed.`;

  const html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:-apple-system,sans-serif;padding:40px 16px">
    <div style="max-width:540px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px">
      <div style="font-size:48px;margin-bottom:8px">${copy.emoji}</div>
      <h1 style="margin:0 0 12px;font-size:22px">${copy.heading}</h1>
      <p style="color:rgba(255,255,255,0.7);line-height:1.6">${detail}</p>
      <p style="margin:24px 0">
        <a href="${base}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700">Open dashboard →</a>
      </p>
      <p style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:32px">You're getting this because you have an artist account on Epic Music Space.</p>
    </div></body></html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: m.to,
    subject: copy.subject(m),
    html,
    text: `${copy.heading}\n\n${detail.replace(/<[^>]+>/g, "")}\n\n${base}/dashboard`,
  });
  if (error) {
    console.error("[email] milestone send failed", error);
    return { ok: false, error };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// Drip onboarding sequence — used by /api/cron/email-drip
// ─────────────────────────────────────────────────────────

export type DripStep = "welcome_day_0" | "tips_day_1" | "payout_day_3";

interface DripPayload {
  to: string;
  name: string;
  step: DripStep;
  isArtist: boolean;
}

const DRIP_COPY: Record<
  DripStep,
  {
    subject: string;
    heading: string;
    forArtist: string;
    forListener: string;
    cta: { label: string; path: string };
  }
> = {
  welcome_day_0: {
    subject: "Welcome to Epic Music Space — start here",
    heading: "Welcome aboard 🎶",
    forArtist:
      "You're set up as an artist. Three things give you the best first week: claim your studio username, upload your first track, and connect Stripe so payouts run automatically.",
    forListener:
      "Find tracks you love, follow the artists making them, and license what you want. The marketplace is sortable by genre, mood, and BPM.",
    cta: { label: "Open my dashboard", path: "/dashboard" },
  },
  tips_day_1: {
    subject: "Day 1: get the most out of Epic Music Space",
    heading: "A few tips while you're getting started",
    forArtist:
      "Cover art lifts conversion ~30%. Stems unlock a higher license tier. Posting an update on your /studio page gives followers a reason to come back. And every track on your studio shows your AI-derived EMS Score — higher score, higher placement.",
    forListener:
      "Following an artist puts their new uploads in your /feed. Liking a track lifts it for everyone. License purchases show up on your dashboard with a downloadable receipt.",
    cta: { label: "Browse the marketplace", path: "/marketplace" },
  },
  payout_day_3: {
    subject: "Reminder: connect Stripe to get paid",
    heading: "One step left before your first payout",
    forArtist:
      "We hold your earnings in escrow until you complete Stripe Connect onboarding. It takes ~3 minutes, requires a bank account or debit card, and is the last step before payouts auto-run every Monday.",
    forListener: "", // Listeners don't get this step.
    cta: { label: "Connect Stripe now", path: "/dashboard?connect=start" },
  },
};

export async function sendDripEmail(payload: DripPayload) {
  const copy = DRIP_COPY[payload.step];
  const body = payload.isArtist ? copy.forArtist : copy.forListener;
  if (!body) return { ok: false, skipped: "not-applicable-for-role" };

  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] drip blocked — RESEND_API_KEY not set", payload.step);
      return { ok: false, error: "EMAIL_PROVIDER_NOT_CONFIGURED" };
    }
    console.info("[email] (dev) drip:", payload);
    return { ok: true, dev: true };
  }

  const base = getSiteUrl();
  const ctaUrl = `${base}${copy.cta.path}`;

  const html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:-apple-system,sans-serif;padding:40px 16px">
    <div style="max-width:540px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px">
      <h1 style="margin:0 0 12px;font-size:22px">${copy.heading}</h1>
      <p style="color:rgba(255,255,255,0.7);line-height:1.65;font-size:14px">Hi ${escapeHtml(payload.name)},</p>
      <p style="color:rgba(255,255,255,0.7);line-height:1.65;font-size:14px">${body}</p>
      <p style="margin:24px 0">
        <a href="${ctaUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700">${copy.cta.label} →</a>
      </p>
      <p style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:32px">You're getting this as part of the Epic Music Space onboarding sequence. <a style="color:rgba(255,255,255,0.55)" href="${base}/profile/edit">Manage email preferences</a>.</p>
    </div></body></html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: payload.to,
    subject: copy.subject,
    html,
    text: `${copy.heading}\n\nHi ${payload.name},\n\n${body}\n\n${copy.cta.label}: ${ctaUrl}`,
  });
  if (error) {
    console.error("[email] drip send failed", error);
    return { ok: false, error };
  }
  return { ok: true };
}

/** Sends a confirmation to a user who just opened a support ticket. */
export async function sendSupportConfirmation(opts: {
  to: string;
  name: string | null;
  ticketCode: string;
  subject: string;
}) {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] support confirmation blocked — RESEND_API_KEY not set");
      return { ok: false, error: "EMAIL_PROVIDER_NOT_CONFIGURED" };
    }
    console.info("[email] (dev) support ticket:", opts);
    return { ok: true, dev: true };
  }
  const base = getSiteUrl();
  const html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:-apple-system,sans-serif;padding:40px 16px">
    <div style="max-width:540px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px">
      <h1 style="margin:0 0 12px;font-size:22px">We got it 👋</h1>
      <p style="color:rgba(255,255,255,0.7);line-height:1.6">Hi ${escapeHtml(opts.name ?? "there")},</p>
      <p style="color:rgba(255,255,255,0.7);line-height:1.6">Thanks for reaching out — we'll respond within one business day. Reply to this email any time and your reply will append to the same ticket.</p>
      <div style="margin:24px 0;padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px">
        <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:rgba(255,255,255,0.4)">Ticket</p>
        <p style="margin:4px 0 0;font-family:ui-monospace,SFMono-Regular,monospace;font-size:14px;color:#a78bfa">${opts.ticketCode}</p>
        <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85)">${escapeHtml(opts.subject)}</p>
      </div>
      <p style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:24px">If this wasn't you, ignore this email — no further action will be taken. Visit ${base} for help articles.</p>
    </div></body></html>`;
  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `[${opts.ticketCode}] We got your message`,
    html,
    text: `Hi ${opts.name ?? "there"},\n\nThanks for reaching out — we'll respond within one business day.\n\nTicket: ${opts.ticketCode}\nSubject: ${opts.subject}\n\nReply to this email any time.`,
  });
  if (error) return { ok: false, error };
  return { ok: true };
}

/** Weekly recap emailed to artists every Friday morning (cron-driven). */
export interface WeeklyDigest {
  to: string;
  artistName: string;
  newFollowers: number;
  licensesSold: number;
  grossDollars: number;
  topTrackTitle: string | null;
  topTrackPlays: number;
  totalPlays: number;
}

export async function sendWeeklyDigestEmail(d: WeeklyDigest) {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] weekly digest blocked — RESEND_API_KEY not set");
      return { ok: false };
    }
    console.info("[email] (dev) weekly digest:", d);
    return { ok: true, dev: true };
  }
  const base = getSiteUrl();
  const noActivity = d.newFollowers === 0 && d.licensesSold === 0 && d.totalPlays === 0;

  const html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:-apple-system,sans-serif;padding:40px 16px">
    <div style="max-width:560px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:36px 32px">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#a78bfa">This week on EMS</p>
      <h1 style="margin:0 0 12px;font-size:22px">Hi ${escapeHtml(d.artistName)} — your 7-day recap</h1>
      ${noActivity
        ? `<p style="color:rgba(255,255,255,0.7);line-height:1.6">No new activity this week. A new post or a freshly uploaded track is the fastest way to get the leaderboard moving — try /studio/new or /feed.</p>`
        : `<table style="width:100%;border-collapse:collapse;margin:18px 0">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:rgba(255,255,255,0.55)">New followers</td>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);text-align:right;font-size:18px;font-weight:800">${d.newFollowers}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:rgba(255,255,255,0.55)">Licenses sold</td>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);text-align:right;font-size:18px;font-weight:800">${d.licensesSold}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:rgba(255,255,255,0.55)">Gross</td>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);text-align:right;font-size:18px;font-weight:800;color:#34d399">$${d.grossDollars.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;font-size:13px;color:rgba(255,255,255,0.55)">Plays this week</td>
              <td style="padding:10px 0;text-align:right;font-size:18px;font-weight:800">${d.totalPlays}</td>
            </tr>
          </table>
          ${d.topTrackTitle ? `<p style="color:rgba(255,255,255,0.55);font-size:13px">Top track: <strong style="color:#fff">${escapeHtml(d.topTrackTitle)}</strong> · ${d.topTrackPlays} plays</p>` : ""}`}
      <p style="margin:24px 0">
        <a href="${base}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700">Open dashboard →</a>
      </p>
      <p style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:24px">You're getting this because you're an artist on Epic Music Space. <a style="color:rgba(255,255,255,0.55)" href="${base}/profile/edit">Manage email preferences</a>.</p>
    </div></body></html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: d.to,
    subject: `Your EMS week — ${d.licensesSold} sold, ${d.newFollowers} new followers`,
    html,
    text: `Hi ${d.artistName},\n\nThis week on Epic Music Space:\n  New followers: ${d.newFollowers}\n  Licenses sold: ${d.licensesSold}\n  Gross: $${d.grossDollars.toFixed(2)}\n  Plays: ${d.totalPlays}${d.topTrackTitle ? `\n  Top track: ${d.topTrackTitle} (${d.topTrackPlays} plays)` : ""}\n\nDashboard: ${base}/dashboard`,
  });
  if (error) return { ok: false, error };
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildVerificationHtml(url: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify your email</title></head>
<body style="background:#0a0a0a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:40px 16px">
  <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto">
    <tr><td>
      <div style="text-align:center;margin-bottom:32px">
        <div style="display:inline-flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.3);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">♫</div>
          <span style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#a78bfa,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Epic Music Space</span>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px;text-align:center">
        <h1 style="margin:0 0 12px;font-size:26px;font-weight:800">Verify your email</h1>
        <p style="margin:0 0 32px;color:rgba(255,255,255,0.5);font-size:15px;line-height:1.6">
          Click the button below to confirm your email address and activate your account. The link expires in 24 hours.
        </p>
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.01em">
          Verify email address →
        </a>
        <p style="margin:28px 0 0;font-size:12px;color:rgba(255,255,255,0.25)">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
      <p style="text-align:center;margin-top:24px;font-size:11px;color:rgba(255,255,255,0.2)">
        If the button doesn't work, copy and paste this URL into your browser:<br>
        <span style="color:rgba(139,92,246,0.7)">${url}</span>
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

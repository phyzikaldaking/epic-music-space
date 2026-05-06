import { createHash } from "crypto";
import { track } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { page } from "@/lib/pager";

export type AuthEventName =
  | "register_rate_limited"
  | "register_bot_blocked"
  | "register_invalid_input"
  | "register_existing_email"
  | "register_created"
  | "verification_email_send_failed"
  | "verification_email_sent"
  | "resend_rate_limited"
  | "resend_accepted"
  | "resend_email_send_failed"
  | "verify_invalid_link"
  | "verify_expired_link"
  | "verify_success"
  | "signin_invalid_credentials"
  | "signin_email_unverified"
  | "signin_rate_limited"
  | "signin_suspended"
  | "oauth_signin_success"
  | "oauth_signin_failure"
  | "phone_login_code_requested"
  | "phone_login_code_failed"
  | "phone_signin_invalid_code"
  | "phone_signin_invalid_phone"
  | "magic_link_rate_limited"
  | "magic_link_sent"
  | "magic_link_skipped"
  | "magic_link_send_failed"
  | "magic_link_invalid"
  | "magic_link_signin_success";

export type AuthEventMeta = {
  email?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  reason?: string;
  providerError?: string;
  retryAfterSeconds?: number;
  role?: string;
  [key: string]: unknown;
};

function hashIp(ip?: string): string | undefined {
  if (!ip || ip === "unknown") return undefined;
  const salt = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-ip-hash-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

async function persistAuthEvent(event: AuthEventName, meta: AuthEventMeta) {
  if (!process.env.DATABASE_URL) return;
  const { email, userId, ip, userAgent, reason, ...rest } = meta;
  try {
    await prisma.authEvent.create({
      data: {
        event,
        userId: userId ?? null,
        emailMasked: maskEmail(email) ?? null,
        ipHash: hashIp(ip) ?? null,
        userAgent: userAgent?.slice(0, 500) ?? null,
        reason: reason ?? null,
        meta: Object.keys(rest).length > 0 ? (rest as object) : undefined,
      },
    });
  } catch (err) {
    console.error("[auth-event] DB persist failed", err);
  }
}

const ALERT_EVENTS = new Set<AuthEventName>([
  "verification_email_send_failed",
  "resend_email_send_failed",
]);

function maskEmail(email?: string) {
  if (!email) return undefined;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "invalid";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function maybeSendAlert(event: AuthEventName, meta: AuthEventMeta) {
  if (!ALERT_EVENTS.has(event)) return;
  page({
    severity: "warn",
    title: `[auth] ${event}`,
    context: {
      service: "epic-music-space/web",
      ts: new Date().toISOString(),
      ...meta,
      email: maskEmail(meta.email),
    },
    fingerprint: `auth:${event}:${meta.userId ?? meta.ip ?? "anon"}`,
  });
}

export async function emitAuthEvent(event: AuthEventName, meta: AuthEventMeta = {}) {
  const payload = {
    ...meta,
    email: maskEmail(meta.email),
  };

  console.info(`[auth-event] ${event}`, payload);

  track({
    event: `auth_${event}`,
    userId: meta.userId,
    properties: payload,
  });

  await Promise.allSettled([persistAuthEvent(event, meta), maybeSendAlert(event, meta)]);
}

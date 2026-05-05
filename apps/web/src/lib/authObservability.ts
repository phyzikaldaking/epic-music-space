import { track } from "@/lib/analytics";

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
  | "signin_email_unverified";

export type AuthEventMeta = {
  email?: string;
  userId?: string;
  ip?: string;
  reason?: string;
  providerError?: string;
  retryAfterSeconds?: number;
  role?: string;
  [key: string]: unknown;
};

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

async function maybeSendAlert(event: AuthEventName, meta: AuthEventMeta) {
  const webhook = process.env.AUTH_ALERT_WEBHOOK_URL;
  if (!webhook || !ALERT_EVENTS.has(event)) return;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: "epic-music-space/web",
        event,
        severity: "warning",
        ts: new Date().toISOString(),
        meta: {
          ...meta,
          email: maskEmail(meta.email),
        },
      }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[auth-alert] Failed to send auth alert", error);
  }
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

  await maybeSendAlert(event, meta);
}

import { randomInt } from "node:crypto";
import { hashAuthToken } from "@/lib/authIdentity";

const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const startsWithDoubleZero = trimmed.startsWith("00");
  const withPrefix = startsWithDoubleZero ? `+${trimmed.slice(2)}` : trimmed;
  const digitsOnly = withPrefix.replace(/[^\d+]/g, "");

  if (!digitsOnly.startsWith("+")) return null;

  const normalized = `+${digitsOnly.slice(1).replace(/\D/g, "")}`;
  if (!PHONE_E164_REGEX.test(normalized)) return null;
  return normalized;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, phone.length - 4))}${phone.slice(-4)}`;
}

export function createPhoneLoginCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function phoneLoginIdentifier(phone: string): string {
  return `phone-login:${phone}`;
}

export function phoneManageCodeIdentifier(userId: string): string {
  return `phone-manage-code:${userId}`;
}

export function phoneManageGrantIdentifier(userId: string): string {
  return `phone-manage-grant:${userId}`;
}

export function hashPhoneLoginCode(code: string, phone: string): string {
  const pepper = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-phone-auth";
  return hashAuthToken(`${phone}:${code}:${pepper}`);
}

export function isPhoneAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      env.TWILIO_VERIFY_FROM,
  );
}

export async function sendPhoneLoginCode(phone: string, code: string) {
  if (!isPhoneAuthConfigured()) {
    return {
      ok: false as const,
      error: "Phone login is not configured.",
    };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_VERIFY_FROM!;

  const body = new URLSearchParams({
    To: phone,
    From: from,
    Body: `Your Epic Music Space login code is ${code}. It expires in 10 minutes.`,
  });

  const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const providerBody = await response.text().catch(() => "unknown");
    return {
      ok: false as const,
      error: providerBody || `Twilio error (${response.status})`,
    };
  }

  return { ok: true as const };
}
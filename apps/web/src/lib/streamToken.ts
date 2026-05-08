import crypto from "node:crypto";

type StreamTokenPayload = {
  songId: string;
  exp: number;
  userId: string | null;
  ipHint: string | null;
  uaHint: string | null;
  allowFull: boolean;
};

const DEFAULT_TTL_SECONDS = 5 * 60;

function getSigningSecret(): string {
  return (
    process.env.STREAM_TOKEN_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "dev-stream-token-secret"
  );
}

function toB64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

function hmac(data: string): string {
  return toB64Url(crypto.createHmac("sha256", getSigningSecret()).update(data).digest());
}

function ipHintFromAddress(ip: string | null): string | null {
  if (!ip || ip === "unknown") return null;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length < 3) return ip;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
  const parts = ip.split(":").filter(Boolean);
  if (parts.length === 0) return ip.slice(0, 8);
  return parts.slice(0, 3).join(":");
}

function uaHintFromUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const normalized = ua.toLowerCase();
  if (normalized.includes("chrome")) return "chrome";
  if (normalized.includes("safari")) return "safari";
  if (normalized.includes("firefox")) return "firefox";
  if (normalized.includes("edg/")) return "edge";
  return "other";
}

export function issueStreamToken(input: {
  songId: string;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  allowFull?: boolean;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(30, input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload: StreamTokenPayload = {
    songId: input.songId,
    exp,
    userId: input.userId ?? null,
    ipHint: ipHintFromAddress(input.ip ?? null),
    uaHint: uaHintFromUserAgent(input.userAgent ?? null),
    allowFull: input.allowFull === true,
  };

  const body = toB64Url(JSON.stringify(payload));
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function verifyStreamToken(token: string, input: {
  songId: string;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): { ok: true; payload: StreamTokenPayload } | { ok: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;

  const expectedSig = hmac(body);
  const sigA = Buffer.from(sig);
  const sigB = Buffer.from(expectedSig);
  if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
    return { ok: false, reason: "signature" };
  }

  let payload: StreamTokenPayload;
  try {
    payload = JSON.parse(fromB64Url(body).toString("utf8")) as StreamTokenPayload;
  } catch {
    return { ok: false, reason: "payload" };
  }

  if (!payload?.songId || payload.songId !== input.songId) {
    return { ok: false, reason: "song" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return { ok: false, reason: "expired" };
  }

  const expectedIpHint = ipHintFromAddress(input.ip ?? null);
  if (payload.ipHint && expectedIpHint && payload.ipHint !== expectedIpHint) {
    return { ok: false, reason: "ip" };
  }

  const expectedUaHint = uaHintFromUserAgent(input.userAgent ?? null);
  if (payload.uaHint && expectedUaHint && payload.uaHint !== expectedUaHint) {
    return { ok: false, reason: "ua" };
  }

  const userId = input.userId ?? null;
  if (payload.userId && payload.userId !== userId) {
    return { ok: false, reason: "user" };
  }

  return { ok: true, payload };
}

export function getStreamTokenQuery(token: string): string {
  return `st=${encodeURIComponent(token)}`;
}

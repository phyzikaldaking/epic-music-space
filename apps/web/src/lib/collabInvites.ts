import { createHmac, timingSafeEqual } from "crypto";
import type { CollabPermission, CollabRole } from "@/lib/collabBackend";

export type CollabInvitePayload = {
  roomId: string;
  role: CollabRole;
  permission: CollabPermission;
  exp: number;
  maxUses?: number;
  issuedAt: number;
};

function secret() {
  return process.env.COLLAB_INVITE_SECRET ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "ems-dev-invite-secret";
}

function encode(input: unknown) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createCollabInvite(payload: Omit<CollabInvitePayload, "issuedAt">) {
  const body = encode({ ...payload, issuedAt: Date.now() });
  return `${body}.${sign(body)}`;
}

export function verifyCollabInvite(token?: string | null): { valid: true; payload: CollabInvitePayload } | { valid: false; reason: string } {
  if (!token) return { valid: false, reason: "Missing invite token" };
  const [body, signature] = token.split(".");
  if (!body || !signature) return { valid: false, reason: "Malformed invite token" };
  const expected = sign(body);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { valid: false, reason: "Invalid invite signature" };
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CollabInvitePayload;
    if (!payload.roomId || !payload.role || !payload.permission || !payload.exp) return { valid: false, reason: "Invite payload incomplete" };
    if (Date.now() > payload.exp) return { valid: false, reason: "Invite expired" };
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "Invite payload unreadable" };
  }
}

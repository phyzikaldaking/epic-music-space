import { z } from "zod";
import { verifyCollabInvite } from "@/lib/collabInvites";

export const roomIdSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/).default("ems-main-room");
export const seatIdSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
export const collabPermissionSchema = z.enum(["OWNER", "EDIT", "COMMENT", "VIEW"]);

export const roomPatchSchema = z.object({
  roomId: roomIdSchema.optional(),
  locked: z.boolean().optional(),
  recordApproval: z.boolean().optional(),
  exportApproval: z.boolean().optional(),
  screenShare: z.boolean().optional(),
  markerCount: z.number().int().min(0).max(9999).optional(),
  title: z.string().min(1).max(80).optional(),
  detail: z.string().min(1).max(240).optional(),
  invite: z.string().min(20).max(2000).optional(),
});

export const seatPatchSchema = z.object({
  roomId: roomIdSchema.optional(),
  seatId: seatIdSchema,
  mic: z.boolean().optional(),
  cam: z.boolean().optional(),
  speaking: z.boolean().optional(),
  online: z.boolean().optional(),
  permission: collabPermissionSchema.optional(),
  invite: z.string().min(20).max(2000).optional(),
});

export const liveKitTokenSchema = z.object({
  roomId: roomIdSchema.optional(),
  identity: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_.@-]+$/).optional(),
  name: z.string().min(1).max(120).optional(),
  canPublish: z.boolean().optional(),
  canSubscribe: z.boolean().optional(),
  canPublishData: z.boolean().optional(),
});

export type CollabAuthority = {
  allowed: boolean;
  reason?: string;
  role: string;
  permission: "OWNER" | "EDIT" | "COMMENT" | "VIEW";
  isAdmin: boolean;
};

export function getRequestIdentity(request: Request) {
  const forwardedEmail = request.headers.get("x-ems-user-email") ?? request.headers.get("x-user-email");
  const forwardedName = request.headers.get("x-ems-user-name") ?? request.headers.get("x-user-name");
  return {
    email: forwardedEmail ?? undefined,
    name: forwardedName ?? forwardedEmail ?? "Studio Guest",
    isAuthenticated: Boolean(forwardedEmail),
  };
}

function adminEmails() {
  return (process.env.COLLAB_ADMIN_EMAILS ?? process.env.EMS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getCollabAuthority(request: Request, roomId: string, invite?: string | null): CollabAuthority {
  const identity = getRequestIdentity(request);
  const isAdmin = Boolean(identity.email && adminEmails().includes(identity.email.toLowerCase()));
  if (isAdmin) return { allowed: true, role: "HOST", permission: "OWNER", isAdmin: true };

  const verified = verifyCollabInvite(invite);
  if (!verified.valid) return { allowed: false, reason: verified.reason, role: "GUEST", permission: "VIEW", isAdmin: false };
  if (verified.payload.roomId !== roomId) return { allowed: false, reason: "Invite does not match this room", role: verified.payload.role, permission: verified.payload.permission, isAdmin: false };
  return { allowed: true, role: verified.payload.role, permission: verified.payload.permission, isAdmin: false };
}

export function canHost(authority: CollabAuthority) {
  return authority.isAdmin || authority.permission === "OWNER" || authority.role === "HOST";
}

export function canEdit(authority: CollabAuthority) {
  return canHost(authority) || authority.permission === "EDIT";
}

export function assertCollabRequest(request: Request) {
  return getRequestIdentity(request);
}

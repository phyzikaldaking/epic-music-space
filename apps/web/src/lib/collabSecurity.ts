import { z } from "zod";

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
});

export const seatPatchSchema = z.object({
  roomId: roomIdSchema.optional(),
  seatId: seatIdSchema,
  mic: z.boolean().optional(),
  cam: z.boolean().optional(),
  speaking: z.boolean().optional(),
  online: z.boolean().optional(),
  permission: collabPermissionSchema.optional(),
});

export const liveKitTokenSchema = z.object({
  roomId: roomIdSchema.optional(),
  identity: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_.@-]+$/).optional(),
  name: z.string().min(1).max(120).optional(),
  canPublish: z.boolean().optional(),
  canSubscribe: z.boolean().optional(),
  canPublishData: z.boolean().optional(),
});

export function getRequestIdentity(request: Request) {
  const forwardedEmail = request.headers.get("x-ems-user-email") ?? request.headers.get("x-user-email");
  const forwardedName = request.headers.get("x-ems-user-name") ?? request.headers.get("x-user-name");
  return {
    email: forwardedEmail ?? undefined,
    name: forwardedName ?? forwardedEmail ?? "Studio Guest",
    isAuthenticated: Boolean(forwardedEmail),
  };
}

export function assertCollabRequest(request: Request) {
  return getRequestIdentity(request);
}

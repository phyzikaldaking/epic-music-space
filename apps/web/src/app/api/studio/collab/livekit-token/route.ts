import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getCollabRoomState } from "@/lib/collabBackend";
import { getRequestIdentity, liveKitTokenSchema } from "@/lib/collabSecurity";
import { verifyCollabInvite } from "@/lib/collabInvites";

export const dynamic = "force-dynamic";

type TokenRequestWithInvite = {
  invite?: string;
  roomId?: string;
  identity?: string;
  name?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
};

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => ({}))) as TokenRequestWithInvite;
  const parsed = liveKitTokenSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ready: false, error: "Invalid LiveKit token request", issues: parsed.error.flatten() }, { status: 400 });

  const body = parsed.data;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({
      ready: false,
      error: "LiveKit is not configured. Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL.",
    }, { status: 200 });
  }

  const requestedRoomId = body.roomId ?? "ems-main-room";
  const invite = verifyCollabInvite(raw.invite);
  if (raw.invite && !invite.valid) {
    return NextResponse.json({ ready: false, error: invite.reason }, { status: 403 });
  }
  if (invite.valid && invite.payload.roomId !== requestedRoomId) {
    return NextResponse.json({ ready: false, error: "Invite does not match this room" }, { status: 403 });
  }

  const room = await getCollabRoomState(requestedRoomId);
  if (room.locked && !invite.valid) {
    return NextResponse.json({ ready: false, error: "Room is locked. A valid invite is required." }, { status: 403 });
  }

  const identity = getRequestIdentity(request);
  const clientIdentity = body.identity ?? identity.email ?? `guest-${crypto.randomUUID()}`;
  const clientName = body.name ?? identity.name ?? "Studio Guest";
  const permission = invite.valid ? invite.payload.permission : "OWNER";
  const canPublish = permission === "OWNER" || permission === "EDIT" || permission === "COMMENT";
  const canPublishData = permission === "OWNER" || permission === "EDIT";

  const token = new AccessToken(apiKey, apiSecret, {
    identity: clientIdentity,
    name: clientName,
    ttl: "2h",
  });

  token.addGrant({
    room: requestedRoomId,
    roomJoin: true,
    canPublish: body.canPublish ?? canPublish,
    canSubscribe: body.canSubscribe ?? true,
    canPublishData: body.canPublishData ?? canPublishData,
  });

  return NextResponse.json({
    ready: true,
    url,
    token: await token.toJwt(),
    roomId: requestedRoomId,
    identity: clientIdentity,
    permission,
    role: invite.valid ? invite.payload.role : "HOST",
  });
}

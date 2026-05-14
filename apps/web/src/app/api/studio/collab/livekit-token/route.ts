import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getCollabRoomState } from "@/lib/collabBackend";
import { getRequestIdentity, liveKitTokenSchema } from "@/lib/collabSecurity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.json().catch(() => ({}));
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

  const roomId = body.roomId ?? "ems-main-room";
  const room = await getCollabRoomState(roomId);
  if (room.locked) {
    return NextResponse.json({ ready: false, error: "Room is locked" }, { status: 403 });
  }

  const identity = getRequestIdentity(request);
  const clientIdentity = body.identity ?? identity.email ?? `guest-${crypto.randomUUID()}`;
  const clientName = body.name ?? identity.name ?? "Studio Guest";

  const token = new AccessToken(apiKey, apiSecret, {
    identity: clientIdentity,
    name: clientName,
    ttl: "2h",
  });

  token.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: body.canPublish ?? true,
    canSubscribe: body.canSubscribe ?? true,
    canPublishData: body.canPublishData ?? true,
  });

  return NextResponse.json({
    ready: true,
    url,
    token: await token.toJwt(),
    roomId,
    identity: clientIdentity,
  });
}

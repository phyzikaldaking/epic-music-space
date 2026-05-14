import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export const dynamic = "force-dynamic";

type TokenRequest = {
  roomId?: string;
  identity?: string;
  name?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as TokenRequest;
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
  const identity = body.identity ?? `guest-${crypto.randomUUID()}`;
  const name = body.name ?? "Studio Guest";

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
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
    identity,
  });
}

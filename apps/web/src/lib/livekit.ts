import { AccessToken } from "livekit-server-sdk";

export type LiveKitConfig = {
  apiKey: string;
  apiSecret: string;
  url: string;
};

export function getLiveKitConfig(): LiveKitConfig | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) return null;
  return { apiKey, apiSecret, url };
}

export function isLiveKitConfigured(): boolean {
  return getLiveKitConfig() !== null;
}

type MintTokenInput = {
  roomId: string;
  identity: string;
  name?: string;
  canPublish: boolean;
  metadata?: Record<string, unknown>;
};

export async function mintRoomToken({
  roomId,
  identity,
  name,
  canPublish,
  metadata,
}: MintTokenInput): Promise<string> {
  const config = getLiveKitConfig();
  if (!config) throw new Error("LiveKit is not configured");

  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
    ttl: "2h",
  });

  at.addGrant({
    room: `ems-room-${roomId}`,
    roomJoin: true,
    canSubscribe: true,
    canPublish,
    canPublishData: true,
  });

  return at.toJwt();
}

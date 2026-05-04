import { RoomServiceClient, EgressClient, EncodedFileType } from "livekit-server-sdk";
import { getLiveKitConfig } from "@/lib/livekit";

export type RecordingConfig = {
  s3AccessKey: string;
  s3Secret: string;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  publicBaseUrl: string;
};

function lkRoomName(roomId: string) {
  return `ems-room-${roomId}`;
}

export function getRecordingConfig(): RecordingConfig | null {
  const s3AccessKey = process.env.LIVEKIT_RECORDING_S3_ACCESS_KEY;
  const s3Secret = process.env.LIVEKIT_RECORDING_S3_SECRET;
  const s3Endpoint = process.env.LIVEKIT_RECORDING_S3_ENDPOINT;
  const s3Region = process.env.LIVEKIT_RECORDING_S3_REGION ?? "us-east-1";
  const s3Bucket = process.env.LIVEKIT_RECORDING_S3_BUCKET;
  const publicBaseUrl = process.env.LIVEKIT_RECORDING_PUBLIC_BASE_URL;
  if (!s3AccessKey || !s3Secret || !s3Endpoint || !s3Bucket || !publicBaseUrl) return null;
  return { s3AccessKey, s3Secret, s3Endpoint, s3Region, s3Bucket, publicBaseUrl };
}

export function isRecordingConfigured(): boolean {
  return getRecordingConfig() !== null;
}

function roomService(): RoomServiceClient {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new Error("LiveKit not configured");
  // RoomServiceClient takes the HTTPS form of the URL. Convert wss:// → https://.
  const httpUrl = cfg.url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  return new RoomServiceClient(httpUrl, cfg.apiKey, cfg.apiSecret);
}

function egressService(): EgressClient {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new Error("LiveKit not configured");
  const httpUrl = cfg.url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  return new EgressClient(httpUrl, cfg.apiKey, cfg.apiSecret);
}

export async function removeRoomParticipant(roomId: string, identity: string): Promise<void> {
  try {
    await roomService().removeParticipant(lkRoomName(roomId), identity);
  } catch (err) {
    // Non-fatal: the participant may already be gone.
    console.warn("[livekitAdmin.removeRoomParticipant]", err);
  }
}

export type StartedEgress = {
  egressId: string;
  filepath: string;
  publicUrl: string;
};

export async function startRoomRecording(roomId: string): Promise<StartedEgress> {
  const recCfg = getRecordingConfig();
  if (!recCfg) throw new Error("Recording is not configured");

  const filename = `rooms/${roomId}/${Date.now()}.mp4`;

  // The livekit-server-sdk types here are awkward (protobuf message classes);
  // the API also accepts the plain JSON shape. Cast through unknown to satisfy
  // TS without dragging the whole protobuf message graph into our code.
  const fileOutput = {
    fileType: EncodedFileType.MP4,
    filepath: filename,
    s3: {
      accessKey: recCfg.s3AccessKey,
      secret: recCfg.s3Secret,
      endpoint: recCfg.s3Endpoint,
      region: recCfg.s3Region,
      bucket: recCfg.s3Bucket,
      forcePathStyle: true,
    },
  };

  const info = await egressService().startRoomCompositeEgress(
    lkRoomName(roomId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { file: fileOutput } as any,
    {
      audioOnly: true,
      layout: "speaker",
    },
  );

  const publicUrl = `${recCfg.publicBaseUrl.replace(/\/$/, "")}/${filename}`;

  return {
    egressId: info.egressId,
    filepath: filename,
    publicUrl,
  };
}

export async function stopRoomRecording(egressId: string): Promise<void> {
  try {
    await egressService().stopEgress(egressId);
  } catch (err) {
    console.warn("[livekitAdmin.stopRoomRecording]", err);
  }
}

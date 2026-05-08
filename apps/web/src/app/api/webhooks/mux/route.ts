import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMuxWebhookSecret } from "@/lib/mux";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mux webhook receiver.
 *
 * We care about three event types:
 *  - video.upload.asset_created  → links uploadId to assetId
 *  - video.asset.ready           → sets playbackId, marks READY
 *  - video.asset.errored         → marks FAILED
 *
 * Mux signs each request with HMAC-SHA256(secret, "{timestamp}.{rawBody}").
 */
function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = getMuxWebhookSecret();

  // ── Hard-require signature verification ────────────────────────────────
  // Previous code skipped verification entirely if MUX_WEBHOOK_SECRET was
  // unset, which let any caller forge READY/FAILED events. We now refuse
  // to process the webhook at all unless the secret is configured AND the
  // signature checks out — fail closed.
  if (!secret) {
    console.error("[mux:webhook] MUX_WEBHOOK_SIGNING_SECRET not configured — refusing webhook");
    return NextResponse.json(
      { error: "Webhook receiver not configured" },
      { status: 503 },
    );
  }
  const sig = req.headers.get("mux-signature");
  if (!verifySignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;
  if (!type || !data) {
    return NextResponse.json({ error: "Missing type/data" }, { status: 400 });
  }

  try {
    if (type === "video.upload.asset_created") {
      const uploadId = data["id"] as string | undefined;
      const assetId = data["asset_id"] as string | undefined;
      if (uploadId && assetId) {
        await Promise.all([
          prisma.post.updateMany({
            where: { muxUploadId: uploadId },
            data: { muxAssetId: assetId, videoStatus: "PROCESSING" },
          }),
          prisma.podcastEpisode.updateMany({
            where: { muxUploadId: uploadId },
            data: { muxAssetId: assetId, videoStatus: "PROCESSING" },
          }),
        ]);
      }
    } else if (type === "video.asset.ready") {
      const assetId = data["id"] as string | undefined;
      const playbackIds = (data["playback_ids"] as Array<{ id: string }> | undefined) ?? [];
      const duration = (data["duration"] as number | undefined) ?? null;
      const aspectRatio = (data["aspect_ratio"] as string | undefined) ?? null;
      const playbackId = playbackIds[0]?.id;
      if (assetId && playbackId) {
        await Promise.all([
          prisma.post.updateMany({
            where: { muxAssetId: assetId },
            data: {
              muxPlaybackId: playbackId,
              videoStatus: "READY",
              videoDurationSec: duration ? Math.round(duration) : null,
              videoAspectRatio: aspectRatio,
            },
          }),
          prisma.podcastEpisode.updateMany({
            where: { muxAssetId: assetId },
            data: {
              muxPlaybackId: playbackId,
              videoStatus: "READY",
              videoDurationSec: duration ? Math.round(duration) : null,
              videoAspectRatio: aspectRatio,
              durationSec: duration ? Math.round(duration) : null,
            },
          }),
        ]);
      }
    } else if (type === "video.asset.errored") {
      const assetId = data["id"] as string | undefined;
      if (assetId) {
        await Promise.all([
          prisma.post.updateMany({
            where: { muxAssetId: assetId },
            data: { videoStatus: "FAILED" },
          }),
          prisma.podcastEpisode.updateMany({
            where: { muxAssetId: assetId },
            data: { videoStatus: "FAILED" },
          }),
        ]);
      }
    }
  } catch (err) {
    console.error("[mux:webhook] processing error", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

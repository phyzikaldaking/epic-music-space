import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import { getLiveKitConfig } from "@/lib/livekit";

export const runtime = "nodejs";

// LiveKit signs webhook requests with the API key/secret. We verify the
// Authorization header before trusting the payload — anything with a bad
// signature is rejected.
export async function POST(req: Request) {
  const cfg = getLiveKitConfig();
  if (!cfg) {
    return NextResponse.json({ error: "LiveKit not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 400 });
  }

  const body = await req.text();
  const receiver = new WebhookReceiver(cfg.apiKey, cfg.apiSecret);

  let event;
  try {
    event = await receiver.receive(body, auth);
  } catch (err) {
    console.error("[livekit-webhook] verify failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.event === "egress_ended" && event.egressInfo) {
    const egressInfo = event.egressInfo;
    const egressId = egressInfo.egressId;
    const status = egressInfo.status; // EGRESS_COMPLETE | EGRESS_FAILED | etc

    const completed = String(status) === "EGRESS_COMPLETE";

    const fileResult = egressInfo.fileResults?.[0];
    const durationSeconds = fileResult?.duration
      ? Math.round(Number(fileResult.duration) / 1_000_000_000)
      : null;

    await prisma.roomRecording.updateMany({
      where: { egressId },
      data: {
        status: completed ? "READY" : "FAILED",
        durationSeconds,
        completedAt: new Date(),
        failureReason: completed ? null : (egressInfo.error ?? "Egress failed"),
      },
    });
  }

  return NextResponse.json({ ok: true });
}

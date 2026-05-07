import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@ems/db";
import {
  mirrorStemsToSupabase,
  verifyReplicateSignature,
  type StemUrlMap,
} from "@/lib/stemSeparation";
import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * POST /api/webhooks/replicate
 *
 * Replicate hits this when a stem-separation prediction completes.
 * We verify the signature, mirror the per-stem URLs into Supabase
 * (Replicate's CDN expires after 24h), then mark the Song row READY.
 *
 * Idempotent: replays just re-mirror the same files.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("webhook-signature") ?? req.headers.get("x-replicate-signature");

  // We require a signing secret in production. Without it, refuse to
  // act on the payload — an unsigned webhook is a vector for arbitrary
  // GET-side-effects via crafted output URLs.
  const valid = verifyReplicateSignature(raw, sig);
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !valid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: {
    id: string;
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
    output?: { vocals?: string; drums?: string; bass?: string; other?: string } | null;
    error?: string | null;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const song = await prisma.song.findFirst({
    where: { stemSeparationProviderId: payload.id },
    select: { id: true, stemSeparationStatus: true },
  });
  if (!song) {
    // Either we already processed the success replay (status==READY) or
    // the prediction belongs to a different environment (preview→prod
    // crosstalk). In both cases the safe response is 200 so Replicate
    // doesn't keep retrying.
    return NextResponse.json({ ok: true, ignored: "unknown predictionId" });
  }

  if (payload.status === "failed" || payload.status === "canceled") {
    await prisma.song.update({
      where: { id: song.id },
      data: {
        stemSeparationStatus: "FAILED",
        stemSeparationError: payload.error ?? `Replicate status: ${payload.status}`,
        stemSeparationCompletedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (payload.status !== "succeeded") {
    // starting / processing — just record the latest status, no action.
    await prisma.song.update({
      where: { id: song.id },
      data: { stemSeparationStatus: "PROCESSING" },
    });
    return NextResponse.json({ ok: true });
  }

  // Success path: mirror the stems into Supabase so they're served from
  // our CDN with our cache headers, and store the public URLs on Song.
  if (!payload.output || !payload.output.vocals || !payload.output.drums || !payload.output.bass || !payload.output.other) {
    await prisma.song.update({
      where: { id: song.id },
      data: {
        stemSeparationStatus: "FAILED",
        stemSeparationError: "Replicate succeeded but output was incomplete.",
        stemSeparationCompletedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: false, error: "incomplete output" }, { status: 502 });
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    await prisma.song.update({
      where: { id: song.id },
      data: {
        stemSeparationStatus: "FAILED",
        stemSeparationError: "Supabase not configured for stem mirroring.",
      },
    });
    return NextResponse.json({ error: "supabase unavailable" }, { status: 500 });
  }

  try {
    const stems: StemUrlMap = await mirrorStemsToSupabase(
      song.id,
      payload.output as StemUrlMap,
      async (kind, body) => {
        const path = `stems/${song.id}/${kind}.wav`;
        const { error: upErr } = await supabase.storage
          .from("audio")
          .upload(path, body, {
            contentType: "audio/wav",
            upsert: true,
            cacheControl: "31536000, immutable",
          });
        if (upErr) throw new Error(`Supabase upload (${kind}): ${upErr.message}`);
        const { data } = supabase.storage.from("audio").getPublicUrl(path);
        return data.publicUrl;
      },
    );
    const stemFilesForDb: Prisma.InputJsonObject = {
      vocals: stems.vocals,
      drums: stems.drums,
      bass: stems.bass,
      other: stems.other,
    };

    await prisma.song.update({
      where: { id: song.id },
      data: {
        stemSeparationStatus: "READY",
        stemFiles: stemFilesForDb,
        hasStems: true,
        stemSeparationCompletedAt: new Date(),
        stemSeparationError: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stem mirror failed.";
    await prisma.song.update({
      where: { id: song.id },
      data: {
        stemSeparationStatus: "FAILED",
        stemSeparationError: message,
        stemSeparationCompletedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

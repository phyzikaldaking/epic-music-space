/**
 * POST /api/guest-share
 *
 * Anonymous WAV upload from /studio/try. The visitor records something,
 * hits "Get a shareable link," we upload the bytes to a public bucket,
 * mint a 16-byte URL-safe token, store a GuestShare row with a 7-day
 * expiry, and return the public URL. The visitor copies that link and
 * texts it to a friend; the friend lands on /share/[token], hears the
 * beat, and sees a "Try it yourself" CTA. Free viral loop.
 *
 * Anti-abuse posture:
 *   - Rate-limited per IP (5 / hour) — generous because legit users
 *     might iterate but enough to cap a flooder.
 *   - Hard cap on file size (12 MB / ~2 minutes of WAV).
 *   - WAV-only by mime + magic-bytes sniff, so we don't become
 *     a generic file host.
 *   - Audio gets uploaded to the existing 'audio' bucket under a
 *     'guest-shares/' prefix so a daily cron can purge expired files.
 *
 * Response: { token, shareUrl, listenUrl, expiresAt }
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/authIdentity";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;   // 12 MB ≈ 2 min stereo WAV @ 44.1kHz
const TTL_DAYS = 7;
const BUCKET = "audio";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`guest-share:upload:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many shares from this device. Try again in an hour." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  // We accept either multipart/form-data with field "audio" OR raw
  // application/octet-stream body. Multipart is friendlier for the
  // browser FormData call we use from the client.
  let blob: Blob | null = null;
  let originalName = "guest-share.wav";

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); }
    catch { return NextResponse.json({ error: "Couldn't read your upload." }, { status: 400 }); }
    const f = form.get("audio");
    if (!(f instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
    }
    blob = f;
    if (f instanceof File && f.name) originalName = f.name;
  } else {
    try { blob = await req.blob(); }
    catch { return NextResponse.json({ error: "Couldn't read your upload." }, { status: 400 }); }
  }

  if (!blob) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (blob.size === 0) {
    return NextResponse.json({ error: "Empty audio file." }, { status: 400 });
  }
  if (blob.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${Math.floor(MAX_BYTES / 1024 / 1024)}MB.` },
      { status: 413 },
    );
  }

  // WAV magic bytes: "RIFF....WAVE". We only accept WAV from the guest
  // pipeline because that's what the DAW + PhoneStudio render.
  const buf = Buffer.from(await blob.arrayBuffer());
  const isWav =
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WAVE";
  if (!isWav) {
    return NextResponse.json(
      { error: "Only WAV uploads are accepted from the guest studio." },
      { status: 415 },
    );
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Storage is not configured." },
      { status: 503 },
    );
  }

  const token = randomBytes(12).toString("base64url"); // ~16 chars
  const storagePath = `guest-shares/${token}.wav`;

  const { error: uploadError } = await supabase
    .storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      contentType: "audio/wav",
      upsert: false,
      cacheControl: "public, max-age=604800, immutable",
    });

  if (uploadError) {
    console.error("[guest-share] upload error", uploadError);
    return NextResponse.json(
      { error: "Couldn't save your audio. Try again." },
      { status: 500 },
    );
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  // Estimate duration from the WAV header (PCM only — best effort,
  // good enough for the share page caption).
  let durationSec: number | null = null;
  try {
    const sampleRate = buf.readUInt32LE(24);
    const byteRate = buf.readUInt32LE(28);
    if (byteRate > 0) durationSec = Math.round((buf.length - 44) / byteRate);
    if (!durationSec && sampleRate > 0) durationSec = null;
  } catch { /* ignore */ }

  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  const ipHash = createHash("sha256").update(`${ip}|guest-share`).digest("hex").slice(0, 32);

  await prisma.guestShare.create({
    data: {
      token,
      audioUrl: publicUrl,
      fileName: originalName.slice(0, 200),
      ipHash,
      durationSec,
      expiresAt,
    },
  });

  const site = getSiteUrl().replace(/\/$/, "");
  return NextResponse.json({
    ok: true,
    token,
    shareUrl: `${site}/share/${token}`,
    listenUrl: publicUrl,
    expiresAt: expiresAt.toISOString(),
  });
}

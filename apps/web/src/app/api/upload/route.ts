import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { moderateLimiter } from "@/lib/rateLimit";

// ─── Allowed MIME types per upload type ────────────────────────────────────
// iPhone Voice Memos and most iTunes-purchased songs report `audio/mp4` /
// `audio/x-m4a`; AIFF is the default for some Mac/iOS audio apps. Some
// browsers (Android Chrome, mobile Safari with cloud picks) report empty
// or `application/octet-stream`. The route also accepts files by extension
// further down so users don't get stuck when the OS forgets the MIME.
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg", "audio/mp3",
  "audio/wav", "audio/x-wav", "audio/wave",
  "audio/flac", "audio/x-flac",
  "audio/aac", "audio/x-aac",
  "audio/mp4", "audio/m4a", "audio/x-m4a",
  "audio/ogg", "audio/x-ogg",
  "audio/webm",
  "audio/aiff", "audio/x-aiff",
  "application/octet-stream",
]);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "image/heic", "image/heif",
]);
const ALLOWED_STEM_TYPES = new Set([
  "application/zip", "application/x-zip-compressed", "application/octet-stream",
  "audio/mpeg", "audio/mp3",
  "audio/wav", "audio/x-wav", "audio/wave",
  "audio/flac", "audio/x-flac",
  "audio/mp4", "audio/m4a", "audio/x-m4a",
  "audio/aiff", "audio/x-aiff",
]);

// Extension allowlist mirrors the MIME allowlist for the cases where
// the OS reports no MIME at all (common when picking from cloud drives
// on iOS / Android). The server must still trust *one* of the two so
// it can route, but extension is a strong signal — Supabase will reject
// hostile bytes regardless.
const ALLOWED_AUDIO_EXTS = new Set([
  "mp3", "wav", "wave", "flac", "aac", "m4a", "mp4",
  "ogg", "oga", "opus", "webm", "aif", "aiff",
]);
const ALLOWED_IMAGE_EXTS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif",
]);
const ALLOWED_STEM_EXTS = new Set([
  "zip", "mp3", "wav", "flac", "m4a", "aif", "aiff",
]);

const MAX_AUDIO_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10 MB
const MAX_STEM_SIZE  = 500 * 1024 * 1024; // 500 MB

/**
 * POST /api/upload
 *
 * Returns a Supabase signed upload URL so the browser can PUT the file
 * directly to Supabase Storage — bypassing the Vercel 4.5 MB body limit.
 *
 * Body: JSON { type: "audio"|"cover"|"stem", fileName: string, mimeType: string, fileSize: number }
 * Returns: { signedUrl: string, publicUrl: string, path: string }
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse JSON body ───────────────────────────────────────────────────────
  let body: { type?: string; fileName?: string; mimeType?: string; fileSize?: number };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const { type: uploadType, fileName = "", mimeType = "", fileSize = 0 } = body;

  if (!uploadType || !["audio", "cover", "stem"].includes(uploadType)) {
    return NextResponse.json(
      { error: "type must be 'audio', 'cover', or 'stem'" },
      { status: 400 }
    );
  }

  const isAudio = uploadType === "audio";
  const isStem  = uploadType === "stem";
  const allowedTypes = isStem ? ALLOWED_STEM_TYPES : isAudio ? ALLOWED_AUDIO_TYPES : ALLOWED_IMAGE_TYPES;
  const maxSize = isStem ? MAX_STEM_SIZE : isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;

  // ── Validate mimeType and size from JSON metadata ───────────────────────
  // The client-supplied fileSize is advisory — the real ceiling is enforced
  // by the Supabase bucket's `file_size_limit` policy. We still check here
  // so we can return a friendly 413 *before* the user uploads bytes that
  // will be rejected at the storage layer. Reject obviously bogus values
  // (zero/negative) that suggest a tampered request.
  if (typeof mimeType !== "string") {
    return NextResponse.json({ error: "mimeType must be a string" }, { status: 400 });
  }
  if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "fileSize must be a positive number" }, { status: 400 });
  }
  if (fileSize > maxSize) {
    const limitMb = maxSize / (1024 * 1024);
    return NextResponse.json(
      { error: `File too large. Maximum is ${limitMb} MB.` },
      { status: 413 }
    );
  }
  if (typeof fileName !== "string" || fileName.length === 0 || fileName.length > 256) {
    return NextResponse.json({ error: "Invalid fileName" }, { status: 400 });
  }
  // Strip path traversal characters from the extension lookup.
  const safeExt = fileName
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);

  // Accept by MIME *or* by extension — iOS / Android cloud picks frequently
  // arrive with an empty or generic MIME (octet-stream). Without the
  // extension fallback, "Files → iCloud Drive → my-track.m4a" silently 415s.
  const allowedExts = isStem ? ALLOWED_STEM_EXTS : isAudio ? ALLOWED_AUDIO_EXTS : ALLOWED_IMAGE_EXTS;
  const mimeAllowed = mimeType.length > 0 && allowedTypes.has(mimeType);
  const extAllowed = !!safeExt && allowedExts.has(safeExt);
  if (!mimeAllowed && !extAllowed) {
    const human = mimeType || `.${safeExt ?? "?"}`;
    return NextResponse.json(
      { error: `We can't accept "${human}" yet. Try MP3, WAV, FLAC, M4A, AAC, or OGG.` },
      { status: 415 }
    );
  }

  // ── Create Supabase signed upload URL ────────────────────────────────────
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "File storage is not configured. Paste a direct URL below." },
      { status: 503 }
    );
  }

  const ext = safeExt || (isStem ? "zip" : isAudio ? "mp3" : "jpg");
  const bucket = isAudio || isStem ? "audio" : "covers";
  const pathPrefix = isStem ? `stems/${session.user.id}` : session.user.id;
  const storagePath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data: signedData, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (signedError || !signedData) {
    console.error("[upload] createSignedUploadUrl error:", signedError);
    return NextResponse.json({ error: "Could not create upload URL. Please try again." }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  return NextResponse.json(
    { signedUrl: signedData.signedUrl, publicUrl, path: storagePath },
    { status: 200 }
  );
}

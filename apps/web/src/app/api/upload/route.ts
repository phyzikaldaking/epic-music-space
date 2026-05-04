import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { moderateLimiter } from "@/lib/rateLimit";

// ─── Allowed MIME types per upload type ────────────────────────────────────
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
  "audio/flac", "audio/aac", "audio/ogg", "audio/webm",
]);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
]);
const ALLOWED_STEM_TYPES = new Set([
  "application/zip", "application/x-zip-compressed", "application/octet-stream",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/flac",
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

  // Validate mimeType and size from JSON metadata (Supabase enforces content-type on upload too)
  if (mimeType && !allowedTypes.has(mimeType)) {
    return NextResponse.json({ error: `Invalid file type: ${mimeType}` }, { status: 415 });
  }
  if (fileSize > maxSize) {
    const limitMb = maxSize / (1024 * 1024);
    return NextResponse.json(
      { error: `File too large. Maximum is ${limitMb} MB.` },
      { status: 413 }
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

  const ext = fileName.split(".").pop()?.toLowerCase() ?? (isStem ? "zip" : isAudio ? "mp3" : "jpg");
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

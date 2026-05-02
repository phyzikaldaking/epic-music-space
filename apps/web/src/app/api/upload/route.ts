import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { strictLimiter } from "@/lib/rateLimit";

const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
];

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

const ALLOWED_STEM_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
];

const MAX_AUDIO_SIZE = 50 * 1024 * 1024;  // 50 MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;   // 5 MB
const MAX_STEM_SIZE  = 500 * 1024 * 1024; // 500 MB

/**
 * POST /api/upload
 *
 * Uploads an audio file or cover image to Supabase Storage and returns
 * the public URL. Requires authentication.
 *
 * Body: multipart/form-data
 *   file     — the file to upload
 *   type     — "audio" | "cover" (determines bucket + size limits)
 *
 * Returns { url: string } on success.
 *
 * Gracefully returns a 503 when Supabase Storage is not configured so the
 * rest of the platform still works (artists can paste direct URLs instead).
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(ip);
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

  // ── Parse multipart form ──────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  const uploadType = formData.get("type") as string | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

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

  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type: ${file.type}` },
      { status: 415 }
    );
  }

  if (file.size > maxSize) {
    const limitMb = maxSize / (1024 * 1024);
    return NextResponse.json(
      { error: `File too large. Maximum size is ${limitMb}MB.` },
      { status: 413 }
    );
  }

  // ── Upload to Supabase Storage ────────────────────────────────────────────
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "File storage is not configured. Please provide a direct URL instead." },
      { status: 503 }
    );
  }

  const ext = file.name.split(".").pop() ?? (isStem ? "zip" : isAudio ? "mp3" : "jpg");
  const bucket = isStem ? "audio" : isAudio ? "audio" : "covers";
  const pathPrefix = isStem ? `stems/${session.user.id}` : session.user.id;
  const path = `${pathPrefix}/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[upload] Supabase Storage error:", uploadError);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

  return NextResponse.json({ url: urlData.publicUrl }, { status: 201 });
}

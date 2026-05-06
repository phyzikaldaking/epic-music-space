// Client-side mirror of /api/upload's allow-list. Keep in sync.
// We accept on MIME *or* extension because iOS / Android cloud picks
// frequently arrive with empty or generic MIME types — `audio/*` accept
// hints alone aren't enough on mobile.

export const AUDIO_MIME = new Set([
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

export const IMAGE_MIME = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "image/heic", "image/heif",
]);

export const STEM_MIME = new Set([
  "application/zip", "application/x-zip-compressed", "application/octet-stream",
  "audio/mpeg", "audio/mp3",
  "audio/wav", "audio/x-wav", "audio/wave",
  "audio/flac", "audio/x-flac",
  "audio/mp4", "audio/m4a", "audio/x-m4a",
  "audio/aiff", "audio/x-aiff",
]);

export const AUDIO_EXTS = new Set([
  "mp3", "wav", "wave", "flac", "aac", "m4a", "mp4",
  "ogg", "oga", "opus", "webm", "aif", "aiff",
]);

export const IMAGE_EXTS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif",
]);

export const STEM_EXTS = new Set([
  "zip", "mp3", "wav", "flac", "m4a", "aif", "aiff",
]);

export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_STEM_BYTES = 500 * 1024 * 1024;

export type UploadKind = "audio" | "cover" | "stem";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function getExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return null;
  return fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || null;
}

export function validateUpload(
  kind: UploadKind,
  file: { name: string; type: string; size: number },
): ValidationResult {
  if (file.size <= 0) {
    return { ok: false, reason: "That file looks empty. Pick another and try again." };
  }

  const max = kind === "audio" ? MAX_AUDIO_BYTES : kind === "stem" ? MAX_STEM_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    return {
      ok: false,
      reason: `That file is bigger than ${mb} MB. Try a smaller version, or compress it first.`,
    };
  }

  const mimes = kind === "audio" ? AUDIO_MIME : kind === "stem" ? STEM_MIME : IMAGE_MIME;
  const exts = kind === "audio" ? AUDIO_EXTS : kind === "stem" ? STEM_EXTS : IMAGE_EXTS;
  const ext = getExtension(file.name);
  const mimeOk = !!file.type && mimes.has(file.type);
  const extOk = !!ext && exts.has(ext);

  if (!mimeOk && !extOk) {
    if (kind === "cover") {
      return { ok: false, reason: "Cover must be JPG, PNG, WebP, or HEIC." };
    }
    if (kind === "stem") {
      return { ok: false, reason: "Stems must be a ZIP, WAV, MP3, FLAC, or M4A." };
    }
    return {
      ok: false,
      reason: "Try MP3, WAV, FLAC, M4A, AAC, or OGG. (M4A from your iPhone Files / Music works too.)",
    };
  }

  return { ok: true };
}

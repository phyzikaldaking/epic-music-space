/**
 * Bulletproof client-side image upload — covers profile avatars, studio
 * banners, track covers, and anywhere else we send a user-picked image
 * to Supabase Storage via a signed URL.
 *
 * Why this file exists:
 *   - iPhone Photos/Files give us HEIC/HEIF with no recognizable MIME.
 *   - iCloud / Drive picks frequently arrive with `application/octet-stream`
 *     or an empty `file.type` — `<input accept>` filtering only goes so
 *     far on mobile, so the form has to be the safety net.
 *   - Phone cameras emit 12 MP+ JPEGs that overshoot the 10 MB cap.
 *   - Mobile networks drop the PUT halfway through; one failure shouldn't
 *     mean "the upload doesn't work."
 *
 * The helper:
 *   1. Validates the file against the shared allowlist (MIME *or* ext).
 *   2. Re-encodes to JPEG and downscales to ≤2048px on the long edge
 *      whenever the browser can decode the file via createImageBitmap.
 *      Non-decodable files (HEIC on Chrome/Firefox) are uploaded raw —
 *      it's better to land bytes that Safari can render than to reject
 *      iPhone artists with no path forward.
 *   3. Asks the server for a Supabase signed upload URL.
 *   4. PUTs to Supabase Storage with up to 2 retries on transient failure.
 *   5. Returns the resulting public URL plus diagnostic stats so callers
 *      can show progress / debug info.
 *
 * The dimension/MIME picker is split out as `pickProcessedImageTarget`
 * so we can unit-test it without a DOM.
 */

import { validateUpload } from "@/lib/uploadValidation";

const MAX_LONG_EDGE = 2048;
const JPEG_QUALITY = 0.92;
const PUT_MAX_ATTEMPTS = 3;
const PUT_BASE_DELAY_MS = 600;

export type UploadKind = "cover" | "audio" | "stem";

export interface ClientUploadResult {
  publicUrl: string;
  /** Final MIME we sent to Supabase. JPEG after re-encode; original otherwise. */
  mimeType: string;
  /** Final byte size after any compression. */
  bytes: number;
  /** True when we re-encoded via canvas. */
  reencoded: boolean;
}

export interface ClientUploadProgress {
  phase: "validating" | "processing" | "signing" | "uploading" | "done";
  /** 0–100 when we know it; undefined otherwise. */
  percent?: number;
}

export class ClientUploadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ClientUploadError";
  }
}

/**
 * Top-level entry point. Throws ClientUploadError with a user-readable
 * message on any failure. Callers should surface `err.message` directly.
 */
export async function uploadImage(
  file: File,
  options: {
    kind?: UploadKind;
    onProgress?: (p: ClientUploadProgress) => void;
  } = {},
): Promise<ClientUploadResult> {
  const kind = options.kind ?? "cover";
  const progress = options.onProgress ?? (() => {});

  progress({ phase: "validating" });
  const check = validateUpload(kind, file);
  if (!check.ok) throw new ClientUploadError(check.reason);

  progress({ phase: "processing" });
  const processed = kind === "cover" ? await tryProcessImage(file) : file;
  // Re-validate the *processed* file — auto-downscale should never blow
  // the size limit, but if a recompress somehow grew the file (rare for
  // tiny PNGs converted to JPEG, but possible with strange inputs) we
  // want a clear error rather than a confusing 413 from Supabase.
  const sizeCheck = validateUpload(kind, processed);
  if (!sizeCheck.ok) throw new ClientUploadError(sizeCheck.reason);

  progress({ phase: "signing" });
  const { signedUrl, publicUrl } = await fetchSignedUrl(processed, kind);

  progress({ phase: "uploading", percent: 0 });
  await putWithRetry(signedUrl, processed, (percent) => {
    progress({ phase: "uploading", percent });
  });

  progress({ phase: "done", percent: 100 });
  return {
    publicUrl,
    mimeType: processed.type || file.type || "application/octet-stream",
    bytes: processed.size,
    reencoded: processed !== file,
  };
}

interface ProcessedTarget {
  /** Target width (px). */
  width: number;
  /** Target height (px). */
  height: number;
  /** Whether to re-encode at all. */
  reencode: boolean;
  /** Output MIME if re-encoding. */
  outputMime: "image/jpeg" | "image/png";
  /** Output extension if re-encoding. */
  outputExt: "jpg" | "png";
}

/**
 * Pure dimension/MIME planner. Exported for tests.
 *
 * Rules:
 * - GIFs pass through untouched (re-encoding would drop animation).
 * - PNGs stay PNG so transparency is preserved; JPEG/WebP/HEIC become JPEG.
 * - Anything within MAX_LONG_EDGE and already a sensible web type
 *   ("image/jpeg" or "image/png" or "image/webp") is left alone.
 */
export function pickProcessedImageTarget(input: {
  width: number;
  height: number;
  mimeType: string;
}): ProcessedTarget {
  const { width, height } = input;
  const longEdge = Math.max(width, height);

  const mime = input.mimeType.toLowerCase();
  const isGif = mime === "image/gif";
  const isPng = mime === "image/png";
  const isLossyWebSafe = mime === "image/jpeg" || mime === "image/webp";
  const alreadySmallEnough = longEdge <= MAX_LONG_EDGE;

  if (isGif || (alreadySmallEnough && (isLossyWebSafe || isPng))) {
    return {
      width,
      height,
      reencode: false,
      outputMime: isPng ? "image/png" : "image/jpeg",
      outputExt: isPng ? "png" : "jpg",
    };
  }

  const scale = alreadySmallEnough ? 1 : MAX_LONG_EDGE / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    reencode: true,
    outputMime: isPng ? "image/png" : "image/jpeg",
    outputExt: isPng ? "png" : "jpg",
  };
}

async function tryProcessImage(file: File): Promise<File> {
  // GIF — never recompress (would drop animation).
  if (file.type === "image/gif") return file;

  // SSR or no Image API — skip processing.
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Browser can't decode (most often HEIC/HEIF on Chrome/Firefox).
    // Pass through — Safari & iOS will render it; the server will store
    // it. This is strictly better than rejecting the user.
    return file;
  }

  try {
    const target = pickProcessedImageTarget({
      width: bitmap.width,
      height: bitmap.height,
      mimeType: file.type,
    });
    if (!target.reencode) return file;

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), target.outputMime, JPEG_QUALITY),
    );
    if (!blob || blob.size === 0) return file;

    const baseName =
      (file.name.split(".").slice(0, -1).join(".") || file.name || "image")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .slice(0, 64) || "image";
    return new File([blob], `${baseName}.${target.outputExt}`, {
      type: target.outputMime,
    });
  } finally {
    bitmap.close?.();
  }
}

async function fetchSignedUrl(
  file: File,
  kind: UploadKind,
): Promise<{ signedUrl: string; publicUrl: string }> {
  let res: Response;
  try {
    res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: kind,
        // Some mobile pickers leave file.name empty — synthesize a name
        // so the server's extension allowlist still has something to
        // route off when the MIME is also missing.
        fileName: file.name || `upload.${file.type.split("/")[1] || "bin"}`,
        // Server falls back to extension if MIME is missing, but include
        // a best-guess so the route can still allow-list audio vs image.
        mimeType: file.type || guessMimeFromName(file.name) || "application/octet-stream",
        fileSize: file.size,
      }),
    });
  } catch (err) {
    throw new ClientUploadError(
      "Couldn't reach the upload service. Check your connection and try again.",
      err,
    );
  }

  let data: { signedUrl?: string; publicUrl?: string; error?: string };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new ClientUploadError("Upload service returned an unexpected response.");
  }

  if (!res.ok || !data.signedUrl || !data.publicUrl) {
    throw new ClientUploadError(data.error ?? "Couldn't start the upload. Try again.");
  }
  return { signedUrl: data.signedUrl, publicUrl: data.publicUrl };
}

async function putWithRetry(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= PUT_MAX_ATTEMPTS; attempt += 1) {
    try {
      await putOnce(signedUrl, file, onProgress);
      return;
    } catch (err) {
      lastErr = err;
      // 4xx from Supabase means our request is wrong (bad MIME, expired
      // signed URL, etc) — retrying won't help. Bail immediately.
      if (err instanceof ClientUploadError && err.cause === "permanent") {
        throw err;
      }
      if (attempt === PUT_MAX_ATTEMPTS) break;
      await sleep(PUT_BASE_DELAY_MS * attempt);
    }
  }
  throw new ClientUploadError(
    "Upload kept failing after a few tries. Check your connection or try a smaller image.",
    lastErr,
  );
}

function putOnce(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  // XMLHttpRequest gives us upload progress events; fetch() does not yet
  // (the streaming request body API is not universally supported on
  // mobile). The helper falls back to fetch() in environments without
  // XMLHttpRequest (tests, edge), but in the browser we use XHR so the
  // user sees a moving bar.
  if (typeof XMLHttpRequest === "undefined") {
    return fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    }).then((res) => {
      if (!res.ok) {
        const permanent = res.status >= 400 && res.status < 500;
        throw new ClientUploadError(
          `Storage rejected the upload (HTTP ${res.status}).`,
          permanent ? "permanent" : undefined,
        );
      }
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        const permanent = xhr.status >= 400 && xhr.status < 500;
        reject(
          new ClientUploadError(
            `Storage rejected the upload (HTTP ${xhr.status}).`,
            permanent ? "permanent" : undefined,
          ),
        );
      }
    });
    xhr.addEventListener("error", () => {
      reject(new ClientUploadError("Network error during upload."));
    });
    xhr.addEventListener("abort", () => {
      reject(new ClientUploadError("Upload was aborted."));
    });
    xhr.send(file);
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const NAME_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

export function guessMimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext ? (NAME_TO_MIME[ext] ?? "") : "";
}

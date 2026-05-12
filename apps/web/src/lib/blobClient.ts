import { put, del, head } from "@vercel/blob";

/**
 * Upload audio/video to Vercel Blob
 * Returns public URL for CDN access
 */
export async function uploadAudioBlob(
  file: File | Blob,
  path: string
): Promise<string> {
  try {
    const filename = `${path}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const blob = await put(filename, file, {
      access: "public",
      contentType: file.type,
    });
    return blob.url;
  } catch (err) {
    console.error("[blobClient] Upload failed:", err);
    throw new Error("Failed to upload audio");
  }
}

/**
 * Studio helper: upload a blob to an exact pathname (no extra random suffix).
 * Callers can include the full key, e.g. `studio/<project>/<track>.bin`.
 */
export async function uploadStudioAudio(
  pathname: string,
  file: Blob | File
): Promise<{ url: string }> {
  try {
    const contentType =
      typeof (file as { type?: unknown }).type === "string" &&
      (file as { type?: string }).type
        ? (file as { type: string }).type
        : "application/octet-stream";

    const blob = await put(pathname, file, {
      access: "public",
      contentType,
    });
    return { url: blob.url };
  } catch (err) {
    console.error("[blobClient] Studio upload failed:", err);
    throw new Error("Failed to upload studio audio");
  }
}

/**
 * Upload video export to Vercel Blob
 */
export async function uploadVideoBlob(
  file: Blob,
  projectId: string,
  format: string
): Promise<string> {
  try {
    const filename = `exports/${projectId}/${Date.now()}.${format}`;
    const blob = await put(filename, file, {
      access: "public",
      contentType: format === "mp4" ? "video/mp4" : "video/webm",
      contentDisposition: `attachment; filename="${projectId}-export.${format}"`,
    });
    return blob.url;
  } catch (err) {
    console.error("[blobClient] Video upload failed:", err);
    throw new Error("Failed to upload video");
  }
}

/**
 * Delete blob by URL
 */
export async function deleteBlob(url: string): Promise<void> {
  try {
    await del(url);
  } catch (err) {
    console.error("[blobClient] Delete failed:", err);
  }
}

/**
 * Check if blob exists and get metadata
 */
export async function checkBlobExists(url: string): Promise<boolean> {
  try {
    await head(url);
    return true;
  } catch {
    return false;
  }
}

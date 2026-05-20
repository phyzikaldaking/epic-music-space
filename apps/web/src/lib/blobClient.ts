"use client";

/** Upload a single audio Blob through the app-wide signed upload flow.
 *  Returns the durable Supabase public URL and object path the Studio can
 *  store on StudioTrack / StudioAudioFile rows. */
export async function uploadStudioAudio(
  pathname: string,
  blob: Blob,
): Promise<{ url: string; path: string }> {
  const fileName = pathname.split("/").pop()?.trim() || "studio-audio.wav";
  const mimeType = blob.type || "audio/wav";
  const signRes = await fetch("/api/upload", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "audio",
      fileName,
      mimeType,
      fileSize: blob.size,
    }),
  });
  const signed = (await signRes.json().catch(() => ({}))) as {
    signedUrl?: string;
    publicUrl?: string;
    path?: string;
    error?: string;
  };
  if (!signRes.ok || !signed.signedUrl || !signed.publicUrl || !signed.path) {
    throw new Error(signed.error ?? `Upload signing failed (${signRes.status}).`);
  }

  const uploadRes = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  if (!uploadRes.ok) {
    throw new Error(`Storage upload failed (${uploadRes.status}).`);
  }

  return { url: signed.publicUrl, path: signed.path };
}

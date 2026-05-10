"use client";

import { upload } from "@vercel/blob/client";

/** Upload a single audio Blob to Vercel Blob via the studio upload route.
 *  Returns the public URL the client can store on a StudioTrack row. */
export async function uploadStudioAudio(
  pathname: string,
  blob: Blob,
): Promise<{ url: string }> {
  const result = await upload(pathname, blob, {
    access: "public",
    handleUploadUrl: "/api/studio/upload",
  });
  return { url: result.url };
}

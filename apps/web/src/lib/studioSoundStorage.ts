export interface StorageObject {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: {
    mimetype?: string;
    size?: number;
    duration?: number;
  } | null;
}

interface StorageBucket {
  list(path: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: "asc" | "desc" } }): Promise<{
    data: StorageObject[] | null;
    error: { message: string } | null;
  }>;
}

const AUDIO_EXTENSIONS = new Set(["aif", "aiff", "flac", "m4a", "mp3", "ogg", "wav", "webm"]);

export function resolveStudioStorageReadKey(env: Partial<Record<"NEXT_PUBLIC_SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY", string>>) {
  return env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
}

function joinStoragePath(prefix: string, name: string) {
  return prefix ? `${prefix}/${name}` : name;
}

function isAudioObject(item: StorageObject) {
  const mimeType = item.metadata?.mimetype?.toLowerCase() ?? "";
  if (mimeType.startsWith("audio/")) return true;
  const extension = item.name.split(".").pop()?.toLowerCase();
  return extension ? AUDIO_EXTENSIONS.has(extension) : false;
}

export async function listAudioObjects(
  bucket: StorageBucket,
  maxResults = 100000,
): Promise<Array<StorageObject & { path: string }>> {
  const results: Array<StorageObject & { path: string }> = [];
  const pendingPrefixes = [""];
  // Supabase Storage accepts up to 1,000 entries per list request. Using the
  // largest useful page avoids repeatedly walking a large, mostly-flat bucket.
  const pageSize = Math.min(1000, Math.max(1, maxResults));

  while (pendingPrefixes.length > 0 && results.length < maxResults) {
    const prefix = pendingPrefixes.shift() ?? "";
    let offset = 0;

    while (results.length < maxResults) {
      const { data, error } = await bucket.list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(error.message);

      const entries = data ?? [];
      for (const item of entries) {
        const path = joinStoragePath(prefix, item.name);
        if (!item.id) pendingPrefixes.push(path);
        else if (isAudioObject(item)) results.push({ ...item, path });
        if (results.length >= maxResults) break;
      }

      if (entries.length < pageSize) break;
      offset += pageSize;
    }
  }

  return results;
}

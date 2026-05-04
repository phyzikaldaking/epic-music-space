import { getStreamUrl } from "@/lib/audioStream";

/**
 * Strips the upstream Supabase `audioUrl` from a song-shaped object before
 * sending it to the client, replacing it with the same-origin stream proxy
 * URL. Use this on every JSON response that includes a song.
 *
 * Stems and the underlying download URL still flow through `audioUrl` for
 * server-internal consumers (cron, webhooks). Never trust the client to
 * read or use the raw URL.
 */
export type SongLike = {
  id: string;
  audioUrl?: string | null;
  [k: string]: unknown;
};

export function publicSong<T extends SongLike>(song: T): Omit<T, "audioUrl"> & {
  streamUrl: string;
} {
  // Avoid mutating caller's object — clone keys we care about.
  const { audioUrl: _drop, ...rest } = song;
  void _drop;
  return { ...(rest as Omit<T, "audioUrl">), streamUrl: getStreamUrl(song.id) };
}

export function publicSongs<T extends SongLike>(songs: T[]): (Omit<T, "audioUrl"> & { streamUrl: string })[] {
  return songs.map((s) => publicSong(s));
}

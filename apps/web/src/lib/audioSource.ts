/**
 * Classifies an audioUrl string so the front-end knows whether to:
 *  - stream it through our same-origin proxy (`<audio src=streamUrl>`),
 *  - embed it via a third-party player iframe (YouTube / Vimeo / SoundCloud),
 *  - or render a "preview unavailable" graceful fallback.
 *
 * Used everywhere we need to render audio from a URL the artist supplied —
 * upload form, track page, studio page, search results, marketplace.
 *
 * Important: this is best-effort UX classification, not a security boundary.
 * The stream proxy itself rejects non-audio upstreams server-side.
 */
export type AudioSourceType =
  | "stream" // direct audio file we can proxy + stream
  | "youtube"
  | "vimeo"
  | "soundcloud"
  | "spotify"
  | "unknown";

export interface AudioSource {
  type: AudioSourceType;
  /** The original URL the artist provided. */
  rawUrl: string;
  /** When type !== "stream", the URL to drop into an iframe `src`. */
  embedUrl?: string;
  /** Human-readable label for badges + warnings. */
  label?: string;
  /** Whether the global EMS player can play this in-page. Only `stream` can. */
  playableInline: boolean;
  /** Friendly message to surface in the upload form when the type isn't stream. */
  warning?: string;
}

const DIRECT_AUDIO_EXTS = [
  ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".webm", ".oga",
];

const YT_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"];
const VIMEO_HOSTS = ["vimeo.com", "www.vimeo.com", "player.vimeo.com"];
const SOUNDCLOUD_HOSTS = ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "snd.sc", "on.soundcloud.com"];
const SPOTIFY_HOSTS = ["open.spotify.com", "spotify.com"];

function youtubeId(url: URL): string | null {
  // youtu.be/<id>
  if (url.hostname === "youtu.be") {
    return url.pathname.slice(1).split("/")[0] || null;
  }
  // youtube.com/watch?v=<id>
  const v = url.searchParams.get("v");
  if (v) return v;
  // youtube.com/embed/<id>
  if (url.pathname.startsWith("/embed/")) {
    return url.pathname.split("/")[2] ?? null;
  }
  // youtube.com/shorts/<id>
  if (url.pathname.startsWith("/shorts/")) {
    return url.pathname.split("/")[2] ?? null;
  }
  return null;
}

export function classifyAudioSource(rawUrl: string | null | undefined): AudioSource {
  const fallback: AudioSource = {
    type: "unknown",
    rawUrl: rawUrl ?? "",
    playableInline: false,
    warning: "We couldn't recognize this URL. Upload the file directly for the best playback experience.",
  };
  if (!rawUrl) return fallback;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fallback;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  // YouTube
  if (YT_HOSTS.includes(host)) {
    const id = youtubeId(url);
    if (!id) return { ...fallback, type: "youtube", label: "YouTube", warning: "Couldn't extract a YouTube video id from that URL." };
    return {
      type: "youtube",
      rawUrl,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      label: "YouTube",
      playableInline: false,
      warning:
        "YouTube tracks can be previewed on the track page via YouTube's embedded player, but they can't be streamed in the EMS global player or licensed through EMS. Upload the audio file directly to enable licensing + downloads.",
    };
  }

  // Vimeo
  if (VIMEO_HOSTS.includes(host)) {
    const idMatch = path.match(/^\/(\d+)/);
    const id = idMatch?.[1];
    if (!id) return { ...fallback, type: "vimeo", label: "Vimeo" };
    return {
      type: "vimeo",
      rawUrl,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      label: "Vimeo",
      playableInline: false,
      warning: "Vimeo tracks render via Vimeo's player — preview only. Upload directly for licensing.",
    };
  }

  // SoundCloud — the official oEmbed approach uses /player/ embed
  if (SOUNDCLOUD_HOSTS.includes(host)) {
    return {
      type: "soundcloud",
      rawUrl,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(rawUrl)}&color=%237c3aed&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false`,
      label: "SoundCloud",
      playableInline: false,
      warning: "SoundCloud tracks render via SoundCloud's embedded player — preview only. Upload directly for licensing.",
    };
  }

  // Spotify
  if (SPOTIFY_HOSTS.includes(host)) {
    // open.spotify.com/track/<id> → embed: open.spotify.com/embed/track/<id>
    const parts = path.split("/").filter(Boolean);
    const kind = parts[0]; // track | album | playlist
    const id = parts[1];
    if (!kind || !id) return { ...fallback, type: "spotify", label: "Spotify" };
    return {
      type: "spotify",
      rawUrl,
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}`,
      label: "Spotify",
      playableInline: false,
      warning: "Spotify tracks render via Spotify's embedded player — preview only. Upload directly for licensing.",
    };
  }

  // Direct audio file — accept any URL whose path ends in a recognized
  // extension. Supabase Storage signed/public URLs hit this path.
  if (DIRECT_AUDIO_EXTS.some((ext) => path.endsWith(ext)) ||
      // Supabase storage URLs sometimes don't have an extension; accept
      // anything served from our own Supabase project too.
      host.endsWith(".supabase.co") ||
      host.endsWith(".amazonaws.com")) {
    return {
      type: "stream",
      rawUrl,
      label: "Direct audio",
      playableInline: true,
    };
  }

  return fallback;
}

/**
 * Convenience: returns true when the URL is an external-embed type
 * (YouTube, Vimeo, SoundCloud, Spotify) — i.e. cannot stream via the
 * EMS proxy.
 */
export function isEmbedSource(rawUrl: string | null | undefined): boolean {
  const t = classifyAudioSource(rawUrl).type;
  return t === "youtube" || t === "vimeo" || t === "soundcloud" || t === "spotify";
}

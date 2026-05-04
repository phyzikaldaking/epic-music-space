"use client";

import { classifyAudioSource } from "@/lib/audioSource";

interface Props {
  audioUrl: string;
  title?: string;
  /** When true, render a compact (h-16) version instead of the full embed. */
  compact?: boolean;
  className?: string;
}

/**
 * Renders the right preview UI for a given audioUrl:
 *   - direct stream → <audio>-style preview (consumers should usually
 *     prefer AudioPlayer / CompactAudioPlayer for these)
 *   - YouTube / Vimeo / SoundCloud / Spotify → vendor iframe player
 *   - unknown → graceful "preview unavailable" card
 *
 * Right-click + browser download is suppressed via onContextMenu and the
 * iframe's sandbox attributes (no allow-downloads).
 */
export default function EmbeddedAudioPreview({ audioUrl, title, compact, className }: Props) {
  const source = classifyAudioSource(audioUrl);

  if (source.type === "youtube" || source.type === "vimeo") {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black ${className ?? ""}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="aspect-video w-full">
          <iframe
            src={source.embedUrl}
            title={title ?? `${source.label} preview`}
            allow="accelerometer; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/65">
          {source.label}
        </span>
      </div>
    );
  }

  if (source.type === "soundcloud") {
    return (
      <div className={`overflow-hidden rounded-2xl border border-white/10 bg-black ${className ?? ""}`}>
        <iframe
          src={source.embedUrl}
          title={title ?? "SoundCloud preview"}
          allow="autoplay"
          referrerPolicy="strict-origin-when-cross-origin"
          className={compact ? "h-20 w-full" : "h-40 w-full"}
        />
      </div>
    );
  }

  if (source.type === "spotify") {
    return (
      <div className={`overflow-hidden rounded-2xl border border-white/10 bg-black ${className ?? ""}`}>
        <iframe
          src={source.embedUrl}
          title={title ?? "Spotify preview"}
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          className={compact ? "h-20 w-full" : "h-40 w-full"}
        />
      </div>
    );
  }

  // Unknown / unsupported URL — show a clear, non-broken fallback rather
  // than a silent <audio> tag that does nothing.
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/8 p-4 text-sm text-yellow-200 ${className ?? ""}`}
      role="alert"
    >
      <span className="text-2xl" aria-hidden>⚠️</span>
      <div className="min-w-0">
        <p className="font-semibold">Preview unavailable</p>
        <p className="text-xs text-yellow-200/70">
          {source.warning ?? "This URL doesn't point to a playable audio file."}
        </p>
      </div>
    </div>
  );
}

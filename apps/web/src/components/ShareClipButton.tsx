"use client";

import { useState } from "react";

// 15-second preview clip share (#G39). Wraps the existing extraction
// flow (lib/promoKit.ts → extractLoudestClip) and uses the Web Share
// API where available, falling back to a copyable URL. Producers drop
// this on any SongCard to give listeners a "share the hook" path.

interface Props {
  songId: string;
  title: string;
  audioUrl?: string | null;
  /** Tone/style override — defaults to "ghost" (subtle). Pass "primary"
   *  on a track page where this is the main share affordance. */
  variant?: "ghost" | "primary";
}

export default function ShareClipButton({
  songId,
  title,
  audioUrl,
  variant = "ghost",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // The actual extraction runs on the client because it needs the
      // Web Audio API. We hand the audio URL to extractLoudestClip,
      // get a 15s Blob, then either invoke navigator.share with the
      // file or fall back to copying the track URL.
      if (!audioUrl) {
        // No audio — share the track page URL instead.
        await fallbackShareUrl(songId, title);
        return;
      }
      const { extractLoudestClip } = await import("@/lib/promoKit");
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        await fallbackShareUrl(songId, title);
        return;
      }
      const ctx = new Ctor();
      try {
        const blob = await extractLoudestClip(audioUrl, ctx, 15);
        const file = new File([blob], `${slug(title)}-clip.wav`, {
          type: "audio/wav",
        });
        const trackUrl = `${window.location.origin}/track/${encodeURIComponent(songId)}`;
        // Web Share Level 2 supports files. iOS Safari has it; Chrome
        // Android has it; desktop Firefox doesn't. Feature-detect.
        const sharer = navigator as Navigator & {
          canShare?: (data: { files?: File[] }) => boolean;
        };
        if (sharer.canShare && sharer.canShare({ files: [file] }) && navigator.share) {
          await navigator.share({
            title: `${title} — 15-second hook`,
            text: `Listen on Epic Music Space`,
            url: trackUrl,
            files: [file],
          });
        } else {
          // Fallback: download the clip locally + copy the track URL.
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
          await navigator.clipboard?.writeText(trackUrl).catch(() => {});
        }
      } finally {
        void ctx.close();
      }
    } catch {
      setError("Couldn't extract clip.");
    } finally {
      setBusy(false);
    }
  }

  const className =
    variant === "primary"
      ? "inline-flex items-center gap-1.5 rounded-md border border-cyan-400/45 bg-cyan-400/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/25 disabled:opacity-50 transition"
      : "inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white/65 hover:bg-white/10 disabled:opacity-50 transition";

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className={className}
      title="Share a 15-second hook of this track"
      aria-label={`Share 15-second clip of ${title}`}
    >
      {busy ? "Building…" : "🎧 Share clip"}
      {error && (
        <span className="ml-1 text-[9px] text-rose-300" aria-live="polite">
          {error}
        </span>
      )}
    </button>
  );
}

async function fallbackShareUrl(songId: string, title: string) {
  const url = `${window.location.origin}/track/${encodeURIComponent(songId)}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      /* user cancelled — fall through to clipboard */
    }
  }
  await navigator.clipboard?.writeText(url).catch(() => {});
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

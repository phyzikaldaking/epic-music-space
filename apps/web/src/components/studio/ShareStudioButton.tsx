"use client";

import { useState } from "react";

interface Props {
  /** Full URL to share — usually `${origin}/studio/${username}`. */
  shareUrl: string;
  /** Artist display name for the native share sheet's title field. */
  artistName: string;
}

/** Share button that picks the best transport at runtime: Web Share API
 *  on devices that support it (mobile, recent desktop Safari/Chrome) and
 *  clipboard copy everywhere else. Keeps the studio page server-rendered
 *  while still surfacing a real share affordance — the artist-growth
 *  loop in the spec needs visitors to share, not just see a button. */
export default function ShareStudioButton({ shareUrl, artistName }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "shared">("idle");

  async function onClick() {
    const data = {
      title: `${artistName} on Epic Music Space`,
      text: `Check out ${artistName}'s studio on EMS — license tracks and start a Versus battle.`,
      url: shareUrl,
    };
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share(data);
        setStatus("shared");
        setTimeout(() => setStatus("idle"), 2000);
        return;
      } catch {
        // User cancelled the share sheet — fall through to clipboard
        // copy so the action still does something useful.
      }
    }
    if (nav?.clipboard) {
      try {
        await nav.clipboard.writeText(shareUrl);
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 2000);
        return;
      } catch {
        // Clipboard blocked (permissions, insecure context). Fall back
        // to no-op so we never throw at the user. The visible URL on
        // the support card next to this button is the manual escape
        // hatch — they can still select + copy.
      }
    }
  }

  const label =
    status === "copied"
      ? "✓ Link copied"
      : status === "shared"
        ? "✓ Shared"
        : "Share studio";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 text-sm font-bold text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <span aria-hidden>{status === "idle" ? "↗" : "✓"}</span>
      {label}
    </button>
  );
}

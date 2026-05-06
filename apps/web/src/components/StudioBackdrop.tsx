import Image from "next/image";

interface Props {
  status: "LIVE" | "ENDED";
  /** Optional override for the backdrop photo. */
  imageUrl?: string;
}

// Curated control-room / tracking-room photographs from Unsplash. Picked for:
//   - dark mid-frame (so UI cards float readable on top)
//   - real gear visible (console, mics, monitors, racks)
//   - warm/red ambient lighting that mirrors the brand purple→accent palette.
//
// LIVE → console front-of-house with neon accents, FINAL → softer warm room.
const LIVE_STUDIO_PHOTO =
  "https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=2600&q=90&auto=format&fit=crop";
const ENDED_STUDIO_PHOTO =
  "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=2600&q=90&auto=format&fit=crop";

/**
 * Cinematic studio-room backdrop for live audio sessions.
 *
 * Layers (back → front):
 *   1. Full-bleed studio photograph
 *   2. Color tint matched to brand palette (purple/cyan radial)
 *   3. Top-down readability scrim so chat / participant cards stay legible
 *   4. Animated scan-line + film-grain texture for depth
 *   5. ON AIR neon sign (top-right) when status === "LIVE"
 *   6. Bottom horizon glow that mimics console LEDs
 *
 * All decorative — pointer-events:none + aria-hidden so screen readers /
 * keyboard nav skip it entirely. Sticks to the viewport via position:fixed
 * so the room UI scrolls over it like a parallax stage.
 */
export default function StudioBackdrop({ status, imageUrl }: Props) {
  const photo = imageUrl ?? (status === "LIVE" ? LIVE_STUDIO_PHOTO : ENDED_STUDIO_PHOTO);
  const live = status === "LIVE";

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* 1. Studio photograph */}
      <Image
        src={photo}
        alt=""
        fill
        priority
        sizes="100vw"
        className={`object-cover transition duration-700 ${
          live ? "saturate-110" : "saturate-50 brightness-75"
        }`}
      />

      {/* 2. Brand-tinted glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(124,58,237,0.45),transparent_55%),radial-gradient(circle_at_82%_18%,rgba(0,245,255,0.32),transparent_55%),radial-gradient(circle_at_50%_120%,rgba(255,72,128,0.35),transparent_60%)]" />

      {/* 3. Readability scrim — heavier on top so headings + controls
          land on a dark surface; lighter mid-frame to keep gear visible. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,9,0.78)_0%,rgba(5,5,9,0.42)_38%,rgba(5,5,9,0.62)_72%,rgba(5,5,9,0.92)_100%)]" />

      {/* 4. Diagonal scan lines + film grain */}
      <div className="absolute inset-x-0 top-0 h-full bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.04)_0_2px,transparent_2px_18px)] mix-blend-screen" />
      <div className="absolute inset-0 opacity-30 mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:3px_3px]" />

      {/* 5. ON AIR neon sign — pinned top-right, fades when ENDED */}
      <div className="absolute right-4 top-4 sm:right-8 sm:top-8">
        <div
          className={`flex items-center gap-2.5 rounded-lg border-2 px-3.5 py-1.5 font-black uppercase tracking-[0.32em] shadow-[0_0_28px_rgba(255,72,128,0.55)] backdrop-blur-sm ${
            live
              ? "border-rose-400/85 bg-rose-500/15 text-rose-200"
              : "border-white/15 bg-black/45 text-white/35"
          }`}
        >
          {live && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-80" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(255,72,128,0.95)]" />
            </span>
          )}
          <span className="text-[11px]">{live ? "On Air" : "Off Air"}</span>
        </div>
      </div>

      {/* 6. Console-LED bottom horizon — thin glowing strip + room VU bars */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-400/65 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-rose-500/30 to-transparent blur-md" />

      {/* Console glow rails — warm red on the left, cool cyan on the right,
          like rim lights bouncing off the live-room glass. */}
      <div className="absolute inset-y-12 left-0 w-px bg-gradient-to-b from-transparent via-rose-400/40 to-transparent" />
      <div className="absolute inset-y-12 right-0 w-px bg-gradient-to-b from-transparent via-cyan-300/35 to-transparent" />
    </div>
  );
}

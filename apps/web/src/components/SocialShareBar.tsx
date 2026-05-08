"use client";

/**
 * SocialShareBar
 *
 * One-click share buttons for Twitter/X, Facebook, TikTok (copy link),
 * Instagram (copy link + prompt), YouTube Community (copy link), and a
 * generic copy-to-clipboard fallback.
 *
 * Usage:
 *   <SocialShareBar url="https://epicmusicspace.com/track/abc" title="My Beat" />
 *
 * All share flows use the Web Share API when available (mobile Safari,
 * Android Chrome) and fall back to platform-specific share URLs on desktop.
 *
 * Note: TikTok, Instagram, and YouTube do not offer public web share
 * endpoints — for those, we copy the link and show a "Paste it in your
 * [platform] post / Story" tooltip. This matches the pattern used by
 * Spotify, SoundCloud, and Apple Music.
 */

import { useState, useCallback } from "react";

interface Props {
  /** Canonical URL to share */
  url: string;
  /** Track or beat title shown in the share text */
  title: string;
  /** Optional extra hashtags (without #) */
  hashtags?: string[];
  /** Compact mode — icons only, no labels */
  compact?: boolean;
}

const DEFAULT_HASHTAGS = ["EpicMusicSpace", "MadeOnEMS", "NewMusic"];

function buildText(title: string, hashtags: string[]): string {
  const tags = hashtags.map((h) => `#${h}`).join(" ");
  return `🎧 ${title} — check this out on @EpicMusicSpace ${tags}`;
}

export default function SocialShareBar({ url, title, hashtags = DEFAULT_HASHTAGS, compact = false }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (label: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers that block clipboard in non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(label);
    setTimeout(() => setCopied(null), 2500);
  }, [url]);

  const webShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url, text: buildText(title, hashtags) });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, [title, url, hashtags]);

  const shareText = encodeURIComponent(buildText(title, hashtags));
  const shareUrl = encodeURIComponent(url);

  const twitterHref = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
  // Reddit share
  const redditHref = `https://reddit.com/submit?url=${shareUrl}&title=${encodeURIComponent(title)}`;

  const btnBase =
    "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Native share (mobile) */}
      <button
        type="button"
        onClick={webShare}
        className={`${btnBase} border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white sm:hidden`}
        title="Share"
      >
        <ShareIcon />
        {!compact && <span>Share</span>}
      </button>

      {/* Twitter / X */}
      <a
        href={twitterHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btnBase} border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20`}
        title="Share on X / Twitter"
      >
        <XIcon />
        {!compact && <span>Post</span>}
      </a>

      {/* Facebook */}
      <a
        href={facebookHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btnBase} border-blue-600/30 bg-blue-600/10 text-blue-300 hover:bg-blue-600/20`}
        title="Share on Facebook"
      >
        <FacebookIcon />
        {!compact && <span>Share</span>}
      </a>

      {/* TikTok — copy link with instructions */}
      <button
        type="button"
        onClick={() => void copy("tiktok")}
        className={`${btnBase} ${
          copied === "tiktok"
            ? "border-pink-400/60 bg-pink-400/15 text-pink-200"
            : "border-pink-500/30 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20"
        }`}
        title="Copy link for TikTok"
      >
        <TikTokIcon />
        {!compact && <span>{copied === "tiktok" ? "Link copied! Paste in TikTok" : "TikTok"}</span>}
      </button>

      {/* Instagram — copy link with instructions */}
      <button
        type="button"
        onClick={() => void copy("instagram")}
        className={`${btnBase} ${
          copied === "instagram"
            ? "border-rose-400/60 bg-rose-400/15 text-rose-200"
            : "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
        }`}
        title="Copy link for Instagram Story/Bio"
      >
        <InstagramIcon />
        {!compact && <span>{copied === "instagram" ? "Link copied! Add to Story" : "Instagram"}</span>}
      </button>

      {/* YouTube — copy link */}
      <button
        type="button"
        onClick={() => void copy("youtube")}
        className={`${btnBase} ${
          copied === "youtube"
            ? "border-red-400/60 bg-red-400/15 text-red-200"
            : "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
        }`}
        title="Copy link for YouTube description / Community post"
      >
        <YouTubeIcon />
        {!compact && <span>{copied === "youtube" ? "Copied! Paste in YouTube" : "YouTube"}</span>}
      </button>

      {/* Reddit */}
      <a
        href={redditHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btnBase} border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20`}
        title="Share on Reddit"
      >
        <RedditIcon />
        {!compact && <span>Reddit</span>}
      </a>

      {/* Copy link generic */}
      <button
        type="button"
        onClick={() => void copy("link")}
        className={`${btnBase} ${
          copied === "link"
            ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
            : "border-white/15 bg-white/5 text-white/60 hover:border-white/25 hover:bg-white/10"
        }`}
        title="Copy link"
      >
        <LinkIcon />
        {!compact && <span>{copied === "link" ? "Copied!" : "Copy link"}</span>}
      </button>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.72a8.27 8.27 0 004.84 1.55V6.82a4.85 4.85 0 01-1.07-.13z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="m16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function RedditIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="12" />
      <path fill="#fff" d="M20 12.007a1.946 1.946 0 00-1.946-1.946c-.52 0-.99.207-1.337.54-1.316-.944-3.133-1.554-5.159-1.635l.872-4.1 2.843.603a1.374 1.374 0 102.728-.065 1.374 1.374 0 00-2.593.65l-3.17-.673a.193.193 0 00-.229.149l-.971 4.573c-2.053.073-3.895.684-5.222 1.634a1.946 1.946 0 10-2.16 3.163 3.746 3.746 0 000 .38c0 1.92 2.238 3.474 4.997 3.474s4.998-1.554 4.998-3.474a3.73 3.73 0 000-.38A1.946 1.946 0 0020 12.007zm-10.5 1.374a1.031 1.031 0 111.031 1.031A1.031 1.031 0 019.5 13.381zm5.75 2.744a3.555 3.555 0 01-2.5.787 3.555 3.555 0 01-2.5-.787.192.192 0 11.272-.272 3.17 3.17 0 002.228.69 3.17 3.17 0 002.228-.69.192.192 0 01.272.272zm-.219-1.713a1.031 1.031 0 111.031-1.031 1.031 1.031 0 01-1.031 1.031z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

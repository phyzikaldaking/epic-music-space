"use client";

import { useState } from "react";

/** Copy-to-clipboard for the iframe snippet a user can paste anywhere
 *  (blog, Notion, Discord, etc.). Lives next to the social share bar
 *  on the track page. The actual embed contents are rendered by
 *  /track/[id]/embed/page.tsx. */
export default function CopyEmbedButton({
  trackId,
  siteUrl,
  title,
}: {
  trackId: string;
  siteUrl: string;
  title: string;
}) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  const embedUrl = `${siteUrl}/track/${trackId}/embed`;
  const safeTitle = title.replace(/"/g, "&quot;");
  const snippet = `<iframe src="${embedUrl}" width="600" height="160" frameborder="0" allow="autoplay; clipboard-write" loading="lazy" title="${safeTitle} on Epic Music Space"></iframe>`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    window.setTimeout(() => setCopied("idle"), 2200);
  };

  return (
    <div className="mt-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
        Embed this track
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={snippet}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-[11px] text-white/65 focus:border-brand-500/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={onCopy}
          className={`rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
            copied === "ok"
              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100"
              : copied === "fail"
                ? "border-rose-400/40 bg-rose-400/15 text-rose-100"
                : "border-cyan-400/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
          }`}
          aria-label="Copy embed code to clipboard"
        >
          {copied === "ok" ? "Copied" : copied === "fail" ? "Press ⌘C" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-white/35">
        Paste into any blog or doc. Plays through Epic Music Space and links back to license.
      </p>
    </div>
  );
}

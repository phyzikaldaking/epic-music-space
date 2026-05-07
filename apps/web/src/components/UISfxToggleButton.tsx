"use client";

import { useEffect, useState } from "react";
import { getUiSfx } from "@/lib/uiSfx";

export default function UISfxToggleButton() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    return getUiSfx().subscribe(setEnabled);
  }, []);

  const label = enabled ? "UI sounds on" : "UI sounds off";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-ui-sfx="tap"
      onClick={async () => {
        const sfx = getUiSfx();
        if (enabled) {
          await sfx.play("menu-close");
          sfx.setEnabled(false);
        } else {
          sfx.setEnabled(true);
          await sfx.warmup();
          await sfx.play("menu-open");
        }
      }}
      className={`hidden h-9 w-9 items-center justify-center rounded-lg border text-white/70 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:flex ${
        enabled
          ? "border-cyan-300/40 bg-cyan-400/10 hover:bg-cyan-400/20"
          : "border-white/12 bg-white/4 hover:bg-white/10"
      }`}
    >
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H3v6h3l5 4V5Z" />
        {enabled ? (
          <>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 9.5a4.5 4.5 0 0 1 0 5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.8 7a8 8 0 0 1 0 10" />
          </>
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="m16 8 5 8" />
        )}
      </svg>
    </button>
  );
}

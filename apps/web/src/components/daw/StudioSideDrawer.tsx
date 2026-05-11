"use client";

import { useEffect, type ReactNode } from "react";

// Right-side drawer that holds the heavy controls (audio settings,
// tempo map, sample chopper, mix tools) so the main edit window
// stays clean. Slides in from the right edge when the user clicks
// the ⚙ in the top toolbar. Press Esc or click the backdrop to
// close.
//
// We don't trap focus inside — the drawer is a panel, not a modal;
// users still need to be able to click into the workspace while
// it's open.

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function StudioSideDrawer({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — soft scrim so the drawer reads as overlay but
          the user can still see what's behind it. Click closes. */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px] transition-opacity"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed right-0 top-0 z-[61] flex h-screen w-[min(420px,90vw)] flex-col border-l border-white/10 bg-zinc-950/95 backdrop-blur shadow-2xl shadow-black/60 transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
        role="dialog"
        aria-label="Studio settings drawer"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
              Studio · Settings
            </p>
            <p className="mt-0.5 text-[11px] text-white/55">
              Audio, tempo, tools, references. Press Esc to close.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 px-2 py-1 text-[10px] uppercase tracking-widest text-white/65 hover:bg-white/10"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>
      </aside>
    </>
  );
}

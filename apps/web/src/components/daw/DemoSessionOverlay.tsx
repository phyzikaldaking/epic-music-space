"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ems.studio.demo-overlay.dismissed.v1";

/** First-visit chooser: drops a pre-loaded session into the workspace so a
 *  brand-new user hears something good in <2s instead of staring at an
 *  empty grid. Two cards: Curated (hand-tuned) vs Random (surpriseSession).
 *
 *  Both buttons dispatch a window event the DawWorkspace listens for, so
 *  this component stays UI-only and doesn't have to import the engine. */
export default function DemoSessionOverlay({ visible: visibleProp }: { visible?: boolean }) {
  const [visible, setVisible] = useState<boolean>(visibleProp ?? false);

  useEffect(() => {
    if (visibleProp !== undefined) {
      setVisible(visibleProp);
      return;
    }
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, [visibleProp]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore — silent dismiss is fine
    }
    setVisible(false);
  }

  function loadCurated() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("studio:load-demo", { detail: { kind: "curated" } }));
    }
    dismiss();
  }

  function loadRandom() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("studio:load-demo", { detail: { kind: "random" } }));
    }
    dismiss();
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a demo session"
      className="fixed inset-0 z-[170] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
    >
      <div className="w-[min(680px,100%)] rounded-2xl border border-tube-300/35 bg-[#0a0a10]/95 p-6 shadow-2xl shadow-black/50">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-tube-300">
          Welcome to the EMS Studio
        </p>
        <h2 className="mt-1 font-display text-2xl uppercase tracking-wide text-white">
          Hear something good first
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Pick a starter session. You can replace, remix, or clear it whenever
          you want.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={loadCurated}
            className="group flex flex-col items-start gap-2 rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-violet-500/10 to-fuchsia-500/10 p-4 text-left transition hover:border-cyan-300/60 hover:from-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <span className="text-2xl">🎵</span>
            <span className="font-display text-sm uppercase tracking-wider text-white">
              Demo session
            </span>
            <span className="text-xs text-white/65">
              Hand-tuned trap groove at 142 BPM. Sounds intentional, not random.
            </span>
          </button>
          <button
            type="button"
            onClick={loadRandom}
            className="group flex flex-col items-start gap-2 rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-rose-500/10 to-fuchsia-500/10 p-4 text-left transition hover:border-amber-300/60 hover:from-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <span className="text-2xl">🎲</span>
            <span className="font-display text-sm uppercase tracking-wider text-white">
              Surprise me
            </span>
            <span className="text-xs text-white/65">
              Randomized kit + pattern + tempo. Different every time.
            </span>
          </button>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/55 hover:bg-white/5 hover:text-white/80 transition"
          >
            Start blank
          </button>
        </div>
      </div>
    </div>
  );
}

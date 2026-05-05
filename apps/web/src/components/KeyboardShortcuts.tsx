"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "/  or  K", label: "Focus the search box" },
  { keys: "Space", label: "Play / pause the current track" },
  { keys: "← / →", label: "Skip back / forward 5%" },
  { keys: "?", label: "Open this help" },
  { keys: "Esc", label: "Close this help" },
];

/**
 * Global keyboard shortcuts. Skipped while the user is typing in any
 * editable surface (input/textarea/contenteditable) so we don't hijack
 * normal keystrokes. Pressing ? opens an in-page modal instead of the
 * native alert() — matches the rest of the UI and renders in webviews.
 */
export default function KeyboardShortcuts() {
  const router = useRouter();
  const player = usePlayer();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function isEditable(t: EventTarget | null) {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    }

    function focusSearch() {
      const el = document.querySelector<HTMLInputElement>('input[type="search"]');
      if (el) {
        el.focus();
        el.select();
      } else {
        router.push("/search");
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
        return;
      }
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/" || e.key === "k") {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (e.key === " " && player.currentSong) {
        e.preventDefault();
        player.togglePlay();
        return;
      }
      if (e.key === "ArrowRight" && player.currentSong) {
        e.preventDefault();
        const next = Math.min(100, player.progress + 5);
        player.seekTo(next);
        return;
      }
      if (e.key === "ArrowLeft" && player.currentSong) {
        e.preventDefault();
        const next = Math.max(0, player.progress - 5);
        player.seekTo(next);
        return;
      }
      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, player, helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-shortcuts-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur"
      onClick={() => setHelpOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/12 bg-[#15151c] p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="kb-shortcuts-title" className="text-lg font-extrabold">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            aria-label="Close"
            className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/60 hover:bg-white/5"
          >
            Esc
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 rounded-lg bg-white/4 px-3 py-2">
              <kbd className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-xs text-white/80">
                {s.keys}
              </kbd>
              <span className="text-xs text-white/65">{s.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-white/35">
          Shortcuts pause inside text inputs, textareas, and the post composer.
        </p>
      </div>
    </div>
  );
}

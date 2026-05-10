"use client";

import { useEffect, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { KEYBOARD_SHORTCUTS, type ShortcutEntry } from "./keyboardShortcuts";

const GROUP_ORDER: ShortcutEntry["group"][] = [
  "Transport",
  "Recording",
  "Mix",
  "Synth",
  "View",
];

/** Glassy modal listing every studio keyboard shortcut. Triggered by `?`
 *  anywhere in the document; closed with `?` or `Esc`. Listening at the
 *  document level so it works even when no specific input is focused. */
export default function ShortcutOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inEditable =
        tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (e.key === "?" && !inEditable) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      ref={focusTrapRef}
      className="fixed inset-0 z-[182] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[min(640px,100%)] max-h-[min(720px,90vh)] overflow-y-auto rounded-2xl border border-tube-300/35 bg-[#0a0a10]/95 p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-tube-300">
              Keyboard
            </p>
            <h2 className="mt-1 font-display text-xl uppercase tracking-wide text-white">
              Studio shortcuts
            </h2>
            <p className="mt-1 text-xs text-white/55">
              Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">?</kbd>{" "}
              again or <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>{" "}
              to close.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/10 transition"
            aria-label="Close shortcuts"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {GROUP_ORDER.map((group) => {
            const entries = KEYBOARD_SHORTCUTS.filter((s) => s.group === group);
            if (entries.length === 0) return null;
            return (
              <section key={group}>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-accent-300/85">
                  {group}
                </p>
                <ul className="space-y-1.5">
                  {entries.map((entry, i) => (
                    <li
                      key={`${entry.description}-${i}`}
                      className="flex items-start justify-between gap-4 text-sm"
                    >
                      <span className="text-white/80">{entry.description}</span>
                      <span className="flex flex-wrap items-center gap-1">
                        {entry.keys.map((k, j) => (
                          <kbd
                            key={`${k}-${j}`}
                            className="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-tube-300"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

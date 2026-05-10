"use client";

import { useEffect, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { STUDIO_TEMPLATES, type StudioTemplate } from "./studioTemplates";

interface UserTemplate {
  id: string;
  name: string;
  bpm: number;
  trackCount: number;
  templateGenre: string | null;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** User-authored templates (saved via "Save as template" — #22). Caller
   *  fetches them from /api/studio/projects?templates=1 and feeds them
   *  here. Empty when the user hasn't saved any yet. */
  userTemplates: UserTemplate[];
  /** Load a built-in template into the engine (BPM + kit + pattern). */
  onLoadBuiltin: (template: StudioTemplate) => Promise<void>;
  /** Clone a user-authored template into a new project. The picker
   *  passes the source id; the workspace clones it server-side. */
  onLoadUserTemplate: (id: string) => Promise<void>;
}

export default function TemplatePicker({
  open,
  onClose,
  userTemplates,
  onLoadBuiltin,
  onLoadUserTemplate,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setBusyId(null);
  }, [open]);

  // Escape dismisses the picker. Keyboard-only users were stuck
  // clicking Close before — every other modal does this so we match.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function pickBuiltin(t: StudioTemplate) {
    setBusyId(t.id);
    try {
      await onLoadBuiltin(t);
      onClose();
    } finally {
      setBusyId(null);
    }
  }

  async function pickUser(id: string) {
    setBusyId(id);
    try {
      await onLoadUserTemplate(id);
      onClose();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start from template"
      ref={trapRef}
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
    >
      <div className="w-[min(720px,100%)] max-h-[85vh] overflow-y-auto rounded-2xl border border-cyan-400/40 bg-[#0a0a10]/95 p-6 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
              Start from template
            </p>
            <h2 className="mt-1 font-display text-xl uppercase tracking-wide text-white">
              Pick a starting point
            </h2>
            <p className="mt-1 text-xs text-white/55">
              Built-in templates seed BPM + kit + a starter beat so you
              hear something on first play. Saved templates are yours.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close template picker"
            className="rounded-md border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/65 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <p className="mt-5 mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
          Built-in
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STUDIO_TEMPLATES.map((t) => {
            const loading = busyId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => void pickBuiltin(t)}
                disabled={busyId !== null}
                className="relative flex flex-col items-start gap-1 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-3 text-left transition hover:border-cyan-300/45 hover:bg-cyan-400/[0.06] disabled:opacity-50"
              >
                <span className="text-2xl" aria-hidden>
                  {t.badge}
                </span>
                <span className="text-sm font-black uppercase tracking-wide text-white">
                  {t.label}
                </span>
                <span className="text-[11px] leading-snug text-white/55">
                  {t.description}
                </span>
                <span className="mt-1 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/70">
                  {t.bpm} BPM · {t.kit}
                </span>
                {loading && (
                  <span className="absolute right-2 top-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-cyan-300/40 border-t-cyan-300" aria-label="Loading" />
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-6 mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
          My templates
        </p>
        {userTemplates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-white/45">
            None yet. Save any project as a template from the Project menu.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {userTemplates.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-amber-300/30 bg-amber-400/[0.06] px-3 py-2"
              >
                <span className="text-lg" aria-hidden>
                  ⭐
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white/95">{t.name}</p>
                  <p className="truncate text-[11px] text-white/55">
                    {t.bpm} BPM · {t.trackCount} tracks
                    {t.templateGenre ? ` · ${t.templateGenre}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void pickUser(t.id)}
                  disabled={busyId !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/45 bg-amber-400/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-400/25 disabled:opacity-50 transition"
                >
                  {busyId === t.id && (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-200/40 border-t-amber-100" aria-hidden />
                  )}
                  {busyId === t.id ? "Loading" : "Use"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

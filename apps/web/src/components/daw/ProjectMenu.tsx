/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { listProjects, type StoredProject } from "./projectStorage";

interface Props {
  currentProjectId: string | null;
  currentProjectName: string;
  onSave: (name: string) => Promise<void>;
  onLoad: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNew: () => void;
  /** Save the current project as a personal template (#22). Stays in
   *  the user's library under "My templates" in the picker. Null when
   *  there's no current project to clone from. */
  onSaveAsTemplate?: (() => Promise<void>) | null;
  /** Open the version-history modal (#20). Null when there's no current
   *  project (versions are scoped per-project). */
  onOpenVersionHistory?: (() => void) | null;
  /** Open the template picker (#21). Available everywhere — even without
   *  a current project — since picking a template starts a new session. */
  onOpenTemplatePicker?: (() => void) | null;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function ProjectMenu({
  currentProjectId,
  currentProjectName,
  onSave,
  onLoad,
  onDelete,
  onNew,
  onSaveAsTemplate,
  onOpenVersionHistory,
  onOpenTemplatePicker,
}: Props) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [name, setName] = useState(currentProjectName);
  const [saving, setSaving] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      void listProjects().then(setProjects).catch(() => setProjects([]));
    }
  }, [open]);

  useEffect(() => {
    setName(currentProjectName);
  }, [currentProjectName]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(name.trim() || "Untitled session");
      const next = await listProjects();
      setProjects(next);
    } finally {
      setSaving(false);
    }
  }

  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      await onLoad(id);
      setOpen(false);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this saved project? This cannot be undone.")) return;
    await onDelete(id);
    setProjects(await listProjects());
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white/75 hover:bg-white/10 transition"
      >
        <span>📁</span>
        <span>Project</span>
        <span className="text-white/40">{currentProjectName}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(400px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-[#0c0c14] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-brand-300/85">
              Project
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/45 hover:text-white text-sm"
              aria-label="Close project menu"
            >
              ✕
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Project name"
              className="flex-1 rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-extrabold uppercase tracking-widest text-white hover:bg-brand-600 disabled:opacity-50 transition"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                onNew();
                setOpen(false);
              }}
              className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white/65 hover:bg-white/10 transition"
            >
              New
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {onOpenTemplatePicker && (
              <button
                type="button"
                onClick={() => {
                  onOpenTemplatePicker();
                  setOpen(false);
                }}
                className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-400/20 transition"
              >
                Start from template
              </button>
            )}
            {onSaveAsTemplate && currentProjectId && (
              <button
                type="button"
                onClick={() => {
                  void onSaveAsTemplate();
                  setOpen(false);
                }}
                className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-100 hover:bg-amber-400/20 transition"
                title="Keep this project as a starting point for future sessions"
              >
                Save as template
              </button>
            )}
            {onOpenVersionHistory && currentProjectId && (
              <button
                type="button"
                onClick={() => {
                  onOpenVersionHistory();
                  setOpen(false);
                }}
                className="rounded-md border border-violet-400/40 bg-violet-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-violet-100 hover:bg-violet-400/20 transition"
              >
                Version history
              </button>
            )}
          </div>

          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
            Saved · {projects.length}
          </p>
          {projects.length === 0 ? (
            <p className="text-xs text-white/45">No saved projects yet. Hit Save to keep this session.</p>
          ) : (
            <ul className="max-h-[300px] space-y-1 overflow-y-auto">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition ${
                    p.id === currentProjectId
                      ? "border-brand-500/40 bg-brand-500/10"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleLoad(p.id)}
                    disabled={loadingId !== null}
                    className="min-w-0 flex-1 text-left disabled:opacity-50"
                  >
                    <p className="truncate text-sm font-bold text-white/95">{p.name}</p>
                    <p className="truncate text-[10px] text-white/40">
                      {fmtDate(p.savedAt)} · {p.trackCount} tracks · {fmtBytes(p.approxBytes)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-red-400"
                    aria-label="Delete project"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

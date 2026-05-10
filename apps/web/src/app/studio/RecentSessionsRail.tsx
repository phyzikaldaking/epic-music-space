"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProjects, type StoredProject } from "@/components/daw/projectStorage";

/** Shows the user's most recent locally-saved DAW sessions. Pulled from
 *  IndexedDB at mount, no SSR. Server-side persistence is a follow-up
 *  (Studio Prisma model has no track storage today). */
export default function RecentSessionsRail() {
  const [projects, setProjects] = useState<StoredProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((all) => {
        if (!cancelled) setProjects(all);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!projects || projects.length === 0) return null;
  const recent = projects.slice(0, 3);
  const hasMore = projects.length > 3;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300/85">
          Recent sessions
        </p>
        {hasMore && (
          <Link
            href="/studio/board?projects=1"
            className="text-[11px] font-bold uppercase tracking-wider text-white/55 hover:text-white transition"
          >
            View all ({projects.length}) →
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map((p) => (
          <SessionCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}

function SessionCard({ project }: { project: StoredProject }) {
  const savedDate = (() => {
    try {
      const d = new Date(project.savedAt);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return project.savedAt;
    }
  })();
  const sizeMb = (project.approxBytes / (1024 * 1024)).toFixed(1);

  return (
    <Link
      href={`/studio/board?resume=${encodeURIComponent(project.id)}`}
      className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c0c14] to-[#0a0a12] p-4 transition hover:border-emerald-400/40 hover:from-emerald-500/[0.06]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-white truncate">{project.name}</p>
        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/55">
          {project.trackCount} tk
        </span>
      </div>

      {/* Placeholder waveform-style thumbnail. The bar heights are derived
          deterministically from the project id, so each card has a stable
          but distinct silhouette without needing real audio. */}
      <div
        aria-hidden
        className="flex h-10 items-end gap-[2px] rounded-md bg-black/40 px-2 py-1.5"
      >
        {Array.from({ length: 32 }).map((_, i) => {
          const seed = (project.id.charCodeAt(i % project.id.length) + i * 7) % 100;
          const h = 18 + (seed / 100) * 78;
          return (
            <span
              key={i}
              className="flex-1 rounded-sm bg-emerald-400/45 transition group-hover:bg-emerald-400/70"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-white/55">
        <span>Saved {savedDate}</span>
        <span>{sizeMb} MB</span>
      </div>
    </Link>
  );
}

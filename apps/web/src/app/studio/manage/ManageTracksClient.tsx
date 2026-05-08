"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";

type ManageSong = {
  id: string;
  title: string;
  coverUrl: string | null;
  genre: string | null;
  licensePrice: number;
  revenueSharePct: number;
  totalLicenses: number;
  soldLicenses: number;
  streamCount: number;
  viewCount: number;
  isActive: boolean;
  isDraft: boolean;
  scheduledAt: string | null;
  createdAt: string;
  licenseVariants: { id: string; name: string; priceUsd: number; terms?: string }[] | null;
};

type FilterKey = "all" | "live" | "draft" | "scheduled" | "stalled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "stalled", label: "Stalled" },
];

export default function ManageTracksClient({
  initialSongs,
  initialFilter,
}: {
  initialSongs: ManageSong[];
  initialFilter: string | null;
}) {
  const [songs, setSongs] = useState(initialSongs);
  const [filter, setFilter] = useState<FilterKey>(
    (FILTERS.find((f) => f.key === initialFilter)?.key as FilterKey) ?? "all",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkRev, setBulkRev] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ManageSong>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    switch (filter) {
      case "live":
        return songs.filter((s) => s.isActive && !s.isDraft && !s.scheduledAt);
      case "draft":
        return songs.filter((s) => s.isDraft);
      case "scheduled":
        return songs.filter((s) => !!s.scheduledAt);
      case "stalled":
        return songs.filter(
          (s) =>
            s.isActive &&
            !s.isDraft &&
            new Date(s.createdAt).getTime() < sevenDaysAgo &&
            s.viewCount >= 50 &&
            s.soldLicenses === 0,
        );
      default:
        return songs;
    }
  }, [songs, filter]);

  const allSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      filtered.forEach((s) => next.delete(s.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((s) => next.add(s.id));
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function applyBulk(patch: Record<string, unknown>) {
    setError(null);
    if (selected.size === 0) {
      setError("Select at least one track first.");
      return;
    }
    const ids = Array.from(selected);
    const res = await fetch("/api/songs/bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songIds: ids, patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Bulk update failed.");
      return;
    }
    startTransition(() => {
      setSongs((prev) =>
        prev.map((s) => (ids.includes(s.id) ? { ...s, ...patch } : s)),
      );
      setBulkPrice("");
      setBulkRev("");
    });
  }

  async function applyBulkPrice() {
    const n = Number(bulkPrice);
    if (!Number.isFinite(n) || n < 0.5) {
      setError("Price must be at least $0.50.");
      return;
    }
    await applyBulk({ licensePrice: n });
  }

  async function applyBulkRev() {
    const n = Number(bulkRev);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError("Revenue share must be between 0 and 100.");
      return;
    }
    await applyBulk({ revenueSharePct: n });
  }

  function startEdit(s: ManageSong) {
    setEditingId(s.id);
    setDraft({
      title: s.title,
      genre: s.genre,
      licensePrice: s.licensePrice,
      revenueSharePct: s.revenueSharePct,
      totalLicenses: s.totalLicenses,
      isActive: s.isActive,
      isDraft: s.isDraft,
      scheduledAt: s.scheduledAt,
    });
    setError(null);
  }

  async function saveEdit(id: string) {
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const key of [
      "title",
      "genre",
      "licensePrice",
      "revenueSharePct",
      "totalLicenses",
      "isActive",
      "isDraft",
      "scheduledAt",
    ] as const) {
      const v = draft[key];
      if (v !== undefined) payload[key] = v;
    }
    const res = await fetch(`/api/songs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Save failed.");
      return;
    }
    startTransition(() => {
      setSongs((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...payload } as ManageSong : s)),
      );
      setEditingId(null);
      setDraft({});
    });
  }

  return (
    <div>
      {/* Filters + counts — segmented metal-toggle style */}
      <div className="mb-4 flex flex-wrap gap-2 rounded-md studio-faceplate-dark p-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? songs.length
              : songs.filter((s) => {
                  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                  if (f.key === "live")
                    return s.isActive && !s.isDraft && !s.scheduledAt;
                  if (f.key === "draft") return s.isDraft;
                  if (f.key === "scheduled") return !!s.scheduledAt;
                  if (f.key === "stalled")
                    return (
                      s.isActive &&
                      !s.isDraft &&
                      new Date(s.createdAt).getTime() < sevenDaysAgo &&
                      s.viewCount >= 50 &&
                      s.soldLicenses === 0
                    );
                  return false;
                }).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`studio-label flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                active
                  ? "bg-tube-500/15 text-tube-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_8px_rgba(255,138,30,0.25)]"
                  : "text-white/50 hover:bg-white/[0.04] hover:text-white/85"
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${active ? "led-on-amber" : "led-off"}`}
              />
              {f.label}
              <span className="text-readout-amber tabular-nums opacity-80">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/8 p-4">
          <span className="text-sm font-semibold text-brand-200">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0.5"
              step="0.50"
              placeholder="$ price"
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
              className="w-24 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={applyBulkPrice}
              disabled={busy}
              className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 text-xs font-bold text-brand-200 hover:bg-brand-500/25 disabled:opacity-50"
            >
              Apply price
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.5"
              placeholder="rev %"
              value={bulkRev}
              onChange={(e) => setBulkRev(e.target.value)}
              className="w-20 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={applyBulkRev}
              disabled={busy}
              className="rounded-lg border border-accent-500/40 bg-accent-500/15 px-3 py-1.5 text-xs font-bold text-accent-200 hover:bg-accent-500/25 disabled:opacity-50"
            >
              Apply rev share
            </button>
          </div>
          <button
            type="button"
            onClick={() => applyBulk({ isDraft: true })}
            disabled={busy}
            className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.08]"
          >
            Mark as drafts
          </button>
          <button
            type="button"
            onClick={() => applyBulk({ isDraft: false, isActive: true })}
            disabled={busy}
            className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.08]"
          >
            Publish
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-white/40 hover:text-white/70"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Channel strip table — each row is a track routed through the bay. */}
      <div className="overflow-hidden rounded-xl studio-faceplate">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="studio-label border-b border-white/10 bg-black/30 text-white/45">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-left">Track</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-left">Price</th>
                <th className="px-4 py-3 text-left">Rev</th>
                <th className="px-4 py-3 text-left">Sold</th>
                <th className="px-4 py-3 text-left">Plays</th>
                <th className="px-4 py-3 text-left">Views</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-white/40"
                  >
                    No tracks match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const isEditing = editingId === s.id;
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-white/5 align-top hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggleOne(s.id)}
                          aria-label={`Select ${s.title}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {s.coverUrl ? (
                            <Image
                              src={s.coverUrl}
                              alt=""
                              width={36}
                              height={36}
                              className="rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-9 w-9 flex-shrink-0 rounded-md bg-white/5" />
                          )}
                          <div className="min-w-0">
                            {isEditing ? (
                              <input
                                value={(draft.title as string | undefined) ?? ""}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, title: e.target.value }))
                                }
                                className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm"
                              />
                            ) : (
                              <Link
                                href={`/track/${s.id}`}
                                className="block truncate font-semibold text-brand-400 hover:underline"
                              >
                                {s.title}
                              </Link>
                            )}
                            <p className="truncate text-[11px] text-white/35">
                              {s.genre ?? "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StateBadge song={s} />
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={draft.licensePrice ?? 0}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                licensePrice: Number(e.target.value),
                              }))
                            }
                            className="w-20 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm"
                          />
                        ) : (
                          <span className="text-readout-amber tabular-nums">
                            ${s.licensePrice.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={draft.revenueSharePct ?? 0}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                revenueSharePct: Number(e.target.value),
                              }))
                            }
                            className="w-16 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm"
                          />
                        ) : (
                          <span className="text-readout-cyan tabular-nums">
                            {s.revenueSharePct}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-readout-amber tabular-nums">
                        {s.soldLicenses}
                        <span className="opacity-50">/{s.totalLicenses}</span>
                      </td>
                      <td className="px-4 py-3 text-readout-amber tabular-nums opacity-80">
                        {s.streamCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-readout-amber tabular-nums opacity-80">
                        {s.viewCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(s.id)}
                              disabled={busy}
                              className="rounded-md bg-brand-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-600 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setDraft({});
                              }}
                              className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-bold text-white/55 hover:bg-white/5"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-bold text-white/70 hover:bg-white/5"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StateBadge({ song }: { song: ManageSong }) {
  // Each state reads as a "channel mode" — a tiny LED dot + a stenciled
  // word, like the lit-up state of a hardware channel strip.
  if (song.isDraft) {
    return (
      <span className="inline-flex items-center gap-1.5 studio-label text-white/60">
        <span aria-hidden className="led-off h-1.5 w-1.5 rounded-full" />
        Draft
      </span>
    );
  }
  if (song.scheduledAt) {
    return (
      <span className="inline-flex items-center gap-1.5 studio-label text-readout-cyan">
        <span aria-hidden className="led-on-amber h-1.5 w-1.5 rounded-full animate-pulse" />
        Scheduled
      </span>
    );
  }
  if (!song.isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 studio-label text-rec-400">
        <span aria-hidden className="led-on-rec h-1.5 w-1.5 rounded-full" />
        Off-air
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 studio-label text-tube-300">
      <span aria-hidden className="led-on-green h-1.5 w-1.5 rounded-full" />
      On-air
    </span>
  );
}

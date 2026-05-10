"use client";

import { useState } from "react";

const ROLES = ["ARTIST", "WRITER", "PRODUCER", "ENGINEER", "FEATURE"] as const;
type Role = (typeof ROLES)[number];

type Entry = {
  id?: string;
  userId: string | null;
  displayName: string;
  role: Role;
  shareBps: number;
  inviteEmail: string | null;
};

type Sheet = {
  id: string;
  status: "DRAFT" | "SIGNED" | "ARCHIVED";
  signedAt: Date | string | null;
  entries: Array<{
    id: string;
    userId: string | null;
    displayName: string;
    role: string;
    shareBps: number;
    inviteEmail: string | null;
  }>;
};

const TOTAL_BPS = 10000;

function pct(bps: number): string {
  return (bps / 100).toFixed(2);
}

export default function SplitSheetEditor({
  songId,
  artistName,
  artistId,
  initialSheet,
}: {
  songId: string;
  artistName: string;
  artistId: string;
  initialSheet: Sheet | null;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(
    initialSheet
      ? {
          ...initialSheet,
          entries: initialSheet.entries.map((e) => ({ ...e, role: e.role as Role })),
        }
      : null,
  );
  const [entries, setEntries] = useState<Entry[]>(
    initialSheet
      ? initialSheet.entries.map((e) => ({
          id: e.id,
          userId: e.userId,
          displayName: e.displayName,
          role: e.role as Role,
          shareBps: e.shareBps,
          inviteEmail: e.inviteEmail,
        }))
      : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = entries.reduce((sum, e) => sum + e.shareBps, 0);
  const isSigned = sheet?.status === "SIGNED";
  const balanced = total === TOTAL_BPS;

  // ──────────────────────────────────────────────────────────────────
  // Empty-state: no sheet yet. Offer to seed one with the artist alone.
  // ──────────────────────────────────────────────────────────────────
  if (!sheet) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-sm text-white/75">
          No split sheet yet. The studio creates one automatically when you
          publish a track with collaborators present. You can also seed one
          here for solo tracks (or to add collaborators by hand).
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await fetch(`/api/songs/${songId}/split-sheet`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                collaborators: [
                  { userId: artistId, displayName: artistName, role: "ARTIST" },
                ],
              }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(json.error ?? `Couldn't create sheet (${res.status}).`);
              setBusy(false);
              return;
            }
            const created = json.sheet as Sheet;
            setSheet(created);
            setEntries(
              created.entries.map((e) => ({
                id: e.id,
                userId: e.userId,
                displayName: e.displayName,
                role: e.role as Role,
                shareBps: e.shareBps,
                inviteEmail: e.inviteEmail,
              })),
            );
            setBusy(false);
          }}
          className="mt-4 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create draft split sheet"}
        </button>
        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // Editable / read-only depending on status.
  // ──────────────────────────────────────────────────────────────────

  const updateEntry = (idx: number, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const addEntry = () => {
    setEntries((prev) => [
      ...prev,
      {
        userId: null,
        displayName: "",
        role: "WRITER",
        shareBps: 0,
        inviteEmail: null,
      },
    ]);
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const distributeEvenly = () => {
    if (entries.length === 0) return;
    const base = Math.floor(TOTAL_BPS / entries.length);
    const remainder = TOTAL_BPS - base * entries.length;
    setEntries((prev) =>
      prev.map((e, i) => ({
        ...e,
        shareBps: base + (i === prev.length - 1 ? remainder : 0),
      })),
    );
  };

  const saveDraft = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/songs/${songId}/split-sheet`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? `Couldn't save (${res.status}).`);
      setBusy(false);
      return;
    }
    setSheet(json.sheet as Sheet);
    setBusy(false);
  };

  const signSheet = async () => {
    if (!balanced) {
      setError(`Shares must sum to 100%. Currently ${pct(total)}%.`);
      return;
    }
    setBusy(true);
    setError(null);
    // Save first to make sure server-side has the latest entries.
    const patch = await fetch(`/api/songs/${songId}/split-sheet`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    if (!patch.ok) {
      const j = await patch.json().catch(() => ({}));
      setError(j.error ?? `Save failed (${patch.status}).`);
      setBusy(false);
      return;
    }
    const sign = await fetch(`/api/songs/${songId}/split-sheet?action=sign`, {
      method: "POST",
    });
    const json = await sign.json().catch(() => ({}));
    if (!sign.ok) {
      setError(json.error ?? `Sign failed (${sign.status}).`);
      setBusy(false);
      return;
    }
    setSheet(json.sheet as Sheet);
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border p-4 ${
          isSigned
            ? "border-emerald-400/30 bg-emerald-400/5"
            : balanced
              ? "border-cyan-400/30 bg-cyan-400/5"
              : "border-amber-400/30 bg-amber-400/5"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-bold uppercase tracking-widest">
            {isSigned ? "Signed" : "Draft"}
          </p>
          <p className="font-mono text-xs">
            Total{" "}
            <span className={balanced ? "text-emerald-200" : "text-amber-200"}>
              {pct(total)}%
            </span>{" "}
            of 100%
          </p>
        </div>
        {isSigned && sheet.signedAt && (
          <p className="mt-1 text-xs text-emerald-200/85">
            Signed {new Date(sheet.signedAt).toLocaleString()}. Future revenue
            flows through these shares.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <div
            key={entry.id ?? `new-${idx}`}
            className="rounded-xl border border-white/10 bg-black/30 p-3"
          >
            <div className="grid gap-2 md:grid-cols-[1.5fr_1fr_1fr_auto]">
              <label className="block text-xs">
                <span className="block text-[10px] uppercase tracking-widest text-white/45">
                  Name
                </span>
                <input
                  type="text"
                  value={entry.displayName}
                  onChange={(e) => updateEntry(idx, { displayName: e.target.value })}
                  disabled={isSigned}
                  className="mt-1 w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white disabled:opacity-60"
                />
              </label>
              <label className="block text-xs">
                <span className="block text-[10px] uppercase tracking-widest text-white/45">
                  Role
                </span>
                <select
                  value={entry.role}
                  onChange={(e) => updateEntry(idx, { role: e.target.value as Role })}
                  disabled={isSigned}
                  className="mt-1 w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-sm disabled:opacity-60"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="block text-[10px] uppercase tracking-widest text-white/45">
                  Share %
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={pct(entry.shareBps)}
                  onChange={(e) =>
                    updateEntry(idx, {
                      shareBps: Math.max(
                        0,
                        Math.min(TOTAL_BPS, Math.round(Number(e.target.value) * 100)),
                      ),
                    })
                  }
                  disabled={isSigned}
                  className="mt-1 w-full rounded border border-white/15 bg-black/40 px-2 py-1 font-mono text-sm text-white disabled:opacity-60"
                />
              </label>
              {!isSigned && (
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="self-end rounded border border-rose-400/40 px-2 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-400/15"
                >
                  Remove
                </button>
              )}
            </div>
            {!entry.userId && !isSigned && (
              <label className="mt-2 block text-xs">
                <span className="block text-[10px] uppercase tracking-widest text-white/45">
                  Invite email (for non-EMS collaborator)
                </span>
                <input
                  type="email"
                  value={entry.inviteEmail ?? ""}
                  onChange={(e) =>
                    updateEntry(idx, { inviteEmail: e.target.value || null })
                  }
                  className="mt-1 w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white"
                />
              </label>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-xs text-white/55">No entries — add at least one collaborator.</p>
        )}
      </div>

      {!isSigned && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addEntry}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10"
          >
            + Add collaborator
          </button>
          <button
            type="button"
            onClick={distributeEvenly}
            disabled={entries.length === 0}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            Distribute evenly
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={signSheet}
            disabled={busy || !balanced || entries.length === 0}
            className="ml-auto rounded-lg border border-emerald-400/50 bg-emerald-400/15 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-40"
            title={!balanced ? "Shares must sum to 100% before signing" : "Lock these shares as the agreement"}
          >
            Sign sheet
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-100">
          {error}
        </p>
      )}
    </div>
  );
}

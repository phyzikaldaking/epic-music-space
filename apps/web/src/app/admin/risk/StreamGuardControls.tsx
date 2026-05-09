"use client";

import { useState } from "react";

type Mode = "normal" | "preview_only" | "blocked";

export default function StreamGuardControls({
  initialMode,
  initialReason,
  initialTtlSeconds,
}: {
  initialMode: Mode;
  initialReason: string | null;
  initialTtlSeconds: number | null;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [reason, setReason] = useState(initialReason ?? "");
  const [ttlMinutes, setTtlMinutes] = useState<string>(
    initialTtlSeconds ? String(Math.max(1, Math.floor(initialTtlSeconds / 60))) : "60",
  );
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [songId, setSongId] = useState("");
  const [songMode, setSongMode] = useState<Mode>("normal");
  const [songReason, setSongReason] = useState("");
  const [songPending, setSongPending] = useState(false);
  const [songMsg, setSongMsg] = useState<string | null>(null);

  async function apply(nextMode: Mode) {
    setPending(true);
    setMsg(null);
    try {
      const payload: { mode: Mode; reason?: string; durationMinutes?: number } = {
        mode: nextMode,
      };
      if (nextMode !== "normal") {
        if (reason.trim()) payload.reason = reason.trim();
        const parsedMinutes = Number(ttlMinutes);
        if (Number.isFinite(parsedMinutes) && parsedMinutes > 0) {
          payload.durationMinutes = Math.floor(parsedMinutes);
        }
      }

      const res = await fetch("/api/admin/risk/stream-guard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update stream guard");
      }
      const body = (await res.json()) as { mode: Mode; ttlSeconds?: number | null };
      setMode(body.mode);
      const ttl = body.ttlSeconds ?? null;
      setMsg(
        body.mode === "normal"
          ? "Stream guard cleared."
          : `Stream guard set to ${body.mode.replace("_", " ")}${ttl ? ` (${Math.max(1, Math.floor(ttl / 60))}m ttl)` : ""}.`,
      );
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Failed to update stream guard.");
    } finally {
      setPending(false);
    }
  }

  async function applySong(nextMode: Mode) {
    if (!songId.trim()) {
      setSongMsg("Enter a song ID first.");
      return;
    }
    setSongPending(true);
    setSongMsg(null);
    try {
      const payload: { mode: Mode; songId: string; reason?: string; durationMinutes?: number } = {
        mode: nextMode,
        songId: songId.trim(),
      };
      if (nextMode !== "normal") {
        if (songReason.trim()) payload.reason = songReason.trim();
        const parsedMinutes = Number(ttlMinutes);
        if (Number.isFinite(parsedMinutes) && parsedMinutes > 0) {
          payload.durationMinutes = Math.floor(parsedMinutes);
        }
      }

      const res = await fetch("/api/admin/risk/stream-guard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update song guard");
      }
      const body = (await res.json()) as { mode: Mode; ttlSeconds?: number | null; songId?: string | null };
      setSongMode(body.mode);
      const ttl = body.ttlSeconds ?? null;
      setSongMsg(
        body.mode === "normal"
          ? `Song guard cleared for ${body.songId ?? songId.trim()}.`
          : `Song guard set to ${body.mode.replace("_", " ")} for ${body.songId ?? songId.trim()}${ttl ? ` (${Math.max(1, Math.floor(ttl / 60))}m ttl)` : ""}.`,
      );
    } catch (error) {
      setSongMsg(error instanceof Error ? error.message : "Failed to update song guard.");
    } finally {
      setSongPending(false);
    }
  }

  const baseBtn = "rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-wider transition disabled:opacity-40";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-white/45">Global Stream Guard</p>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
            mode === "normal"
              ? "bg-emerald-500/20 text-emerald-300"
              : mode === "preview_only"
                ? "bg-amber-500/20 text-amber-200"
                : "bg-red-500/20 text-red-200"
          }`}
        >
          {mode.replace("_", " ")}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-white/60">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Incident response, legal hold, active theft..."
            className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-brand-400/50"
            disabled={pending}
          />
        </label>
        <label className="text-xs text-white/60">
          TTL minutes (optional)
          <input
            value={ttlMinutes}
            onChange={(e) => setTtlMinutes(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="60"
            className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-brand-400/50"
            disabled={pending}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={`${baseBtn} border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20`}
          onClick={() => apply("normal")}
          disabled={pending}
        >
          Normal
        </button>
        <button
          type="button"
          className={`${baseBtn} border-amber-400/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20`}
          onClick={() => apply("preview_only")}
          disabled={pending}
        >
          Preview Only
        </button>
        <button
          type="button"
          className={`${baseBtn} border-red-400/35 bg-red-500/10 text-red-200 hover:bg-red-500/20`}
          onClick={() => apply("blocked")}
          disabled={pending}
        >
          Block All Streams
        </button>
      </div>

      {msg && <p className="mt-3 text-xs text-white/65">{msg}</p>}

      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">Per-song Stream Guard</p>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
              songMode === "normal"
                ? "bg-emerald-500/20 text-emerald-300"
                : songMode === "preview_only"
                  ? "bg-amber-500/20 text-amber-200"
                  : "bg-red-500/20 text-red-200"
            }`}
          >
            {songMode.replace("_", " ")}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-white/60">
            Song ID
            <input
              value={songId}
              onChange={(e) => setSongId(e.target.value)}
              placeholder="cm123..."
              className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-brand-400/50"
              disabled={songPending}
            />
          </label>
          <label className="text-xs text-white/60">
            Song reason
            <input
              value={songReason}
              onChange={(e) => setSongReason(e.target.value)}
              placeholder="Leak response for this track"
              className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-brand-400/50"
              disabled={songPending}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${baseBtn} border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20`}
            onClick={() => applySong("normal")}
            disabled={songPending}
          >
            Song Normal
          </button>
          <button
            type="button"
            className={`${baseBtn} border-amber-400/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20`}
            onClick={() => applySong("preview_only")}
            disabled={songPending}
          >
            Song Preview Only
          </button>
          <button
            type="button"
            className={`${baseBtn} border-red-400/35 bg-red-500/10 text-red-200 hover:bg-red-500/20`}
            onClick={() => applySong("blocked")}
            disabled={songPending}
          >
            Block Song Streams
          </button>
        </div>

        {songMsg && <p className="mt-3 text-xs text-white/65">{songMsg}</p>}
      </div>
    </div>
  );
}

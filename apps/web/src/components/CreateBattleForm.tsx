"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface Song {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string | null;
}

interface CreateBattleFormProps {
  songs: Song[];
}

const DURATIONS = [
  { label: "6h", value: 6 },
  { label: "12h", value: 12 },
  { label: "24h", value: 24 },
  { label: "48h", value: 48 },
  { label: "72h", value: 72 },
];

type BattleFormat = "quick" | "onsite";

export default function CreateBattleForm({ songs }: CreateBattleFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [battleFormat, setBattleFormat] = useState<BattleFormat>("quick");
  const [durationHours, setDurationHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleSong(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length < 10
          ? [...prev, id]
          : prev,
    );
  }

  function close() {
    setOpen(false);
    setSelected([]);
    setBattleFormat("quick");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (battleFormat === "quick" && selected.length !== 2) {
      setError("Quick 1v1 needs exactly 2 of your songs (1 per round).");
      return;
    }
    if (battleFormat === "onsite" && selected.length < 2) {
      setError("Select at least 2 songs.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      let url = "/api/versus";
      let body: Record<string, unknown> = { songAId: selected[0], songBId: selected[1], durationHours };
      let successPath: string | null = null;

      if (battleFormat === "quick") {
        url = "/api/versus/quick-1v1";
        body = { songIds: selected, durationHours };
      } else if (selected.length > 2) {
        url = "/api/versus/royale";
        body = { songIds: selected, durationHours };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as {
        error?: string;
        id?: string;
        quickSessionHref?: string;
        rounds?: Array<{ href: string }>;
      };
      if (!res.ok) { setError(data.error ?? "Failed to create battle."); return; }

      if (battleFormat === "quick") {
        successPath = data.quickSessionHref ?? (data.rounds?.[0]?.href ?? null);
      }

      close();
      if (successPath) {
        router.push(successPath);
      } else {
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const mode = selected.length > 2 ? "royale" : "1v1";
  const canBattle = songs.length >= 2;

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => canBattle && setOpen(true)}
          disabled={!canBattle}
          title={!canBattle ? "Upload at least 2 songs to create a battle" : undefined}
          className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white transition ${
            canBattle
              ? "bg-brand-500 hover:bg-brand-600 glow-purple-sm"
              : "bg-white/10 cursor-not-allowed opacity-50"
          }`}
        >
          ⚔️ Create Battle
        </button>
        {!canBattle && (
          <p className="text-[11px] text-white/35">Upload 2+ songs to battle</p>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#141414] shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-start justify-between p-7 pb-0 flex-shrink-0">
              <div>
                <h2 className="text-xl font-extrabold">⚔️ Create Battle</h2>
                <p className="mt-1 text-xs text-white/40">
                  {battleFormat === "quick"
                    ? selected.length === 2
                      ? "Quick 1v1 ready — 2 rounds"
                      : "Quick 1v1 — pick exactly 2 songs"
                    : selected.length === 0
                      ? "Pick 2–10 songs"
                      : selected.length === 2
                        ? "2 selected — On-site 1v1"
                        : `${selected.length} selected — Battle Royale`}
                </p>
              </div>
              <button type="button" onClick={close} className="mt-0.5 text-white/40 hover:text-white transition text-xl leading-none">✕</button>
            </div>

            <div className="px-7 pt-5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBattleFormat("quick");
                    setSelected((prev) => prev.slice(0, 2));
                    setError("");
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    battleFormat === "quick"
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                      : "border-white/15 bg-white/5 text-white/65 hover:bg-white/10"
                  }`}
                >
                  <p className="font-black uppercase tracking-[0.14em]">Quick 1v1</p>
                  <p className="mt-1 text-[11px] text-white/70">Random on-site opponents · 2 rounds · 1 song per round</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBattleFormat("onsite");
                    setError("");
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    battleFormat === "onsite"
                      ? "border-brand-500/50 bg-brand-500/15 text-brand-100"
                      : "border-white/15 bg-white/5 text-white/65 hover:bg-white/10"
                  }`}
                >
                  <p className="font-black uppercase tracking-[0.14em]">On-site Event</p>
                  <p className="mt-1 text-[11px] text-white/70">Direct 1v1 or Royale from your catalog</p>
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gold-200/90">
                10-song battles are scheduled events in Verzuz for artists/producers only. 
                <Link href="/verzuz/new" className="ml-1 font-bold underline underline-offset-2 hover:text-gold-100">
                  Stage one here
                </Link>
                .
              </p>
            </div>

            {/* Song picker grid */}
            <div className="overflow-y-auto flex-1 min-h-0 px-7 pt-5">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {songs.map((song) => {
                  const idx = selected.indexOf(song.id);
                  const isSelected = idx !== -1;
                  const maxSelectable = battleFormat === "quick" ? 2 : 10;
                  const isDisabled = !isSelected && selected.length >= maxSelectable;
                  return (
                    <button
                      key={song.id}
                      type="button"
                      onClick={() => toggleSong(song.id)}
                      disabled={isDisabled}
                      className={`relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition
                        ${isSelected ? "border-brand-500 bg-brand-500/15 ring-1 ring-brand-500/40" : ""}
                        ${isDisabled ? "border-white/5 opacity-25 cursor-not-allowed" : ""}
                        ${!isSelected && !isDisabled ? "border-white/10 bg-white/3 hover:border-white/30 hover:bg-white/6 cursor-pointer" : ""}
                      `}
                    >
                      {isSelected && (
                        <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-black">
                          {idx + 1}
                        </span>
                      )}
                      <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900 to-accent-600 flex-shrink-0">
                        {song.coverUrl ? (
                          <Image src={song.coverUrl} alt={song.title} fill className="object-cover" unoptimized />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-2xl">🎵</span>
                        )}
                      </div>
                      <div className="w-full">
                        <p className="text-xs font-semibold line-clamp-2 leading-tight">{song.title}</p>
                        <p className="mt-0.5 text-[10px] text-white/45 line-clamp-1">{song.artist}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <form onSubmit={handleSubmit} className="p-7 pt-5 flex-shrink-0 space-y-4">
              {/* Duration */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Duration</p>
                <div className="flex gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDurationHours(d.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        durationHours === d.value
                          ? "border-brand-500/60 bg-brand-500/20 text-brand-300"
                          : "border-white/15 text-white/50 hover:text-white"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode indicator */}
              {selected.length >= 2 && (
                <div className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
                  battleFormat === "quick"
                    ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-200"
                    : mode === "royale"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-brand-500/30 bg-brand-500/10 text-brand-300"
                }`}>
                  {battleFormat === "quick"
                    ? "⚡ Quick 1v1 — two live matches generated against random on-site opponents"
                    : mode === "royale"
                    ? `🏆 Battle Royale — ${selected.length} songs, community picks the winner`
                    : "⚔️ 1v1 — head-to-head, highest votes wins"}
                </div>
              )}

              {error && (
                <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 rounded-xl border border-white/15 py-3 text-sm text-white/60 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || selected.length < 2 || (battleFormat === "quick" && selected.length !== 2)}
                  className="flex-1 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40 glow-purple-sm"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Creating…
                    </span>
                  ) : selected.length < 2 ? (
                    "Select 2+ songs"
                  ) : battleFormat === "quick" && selected.length !== 2 ? (
                    "Pick exactly 2 songs"
                  ) : battleFormat === "quick" ? (
                    "Start Quick 2-Round 1v1 ⚡"
                  ) : mode === "royale" ? (
                    `Launch Royale (${selected.length} songs) 🏆`
                  ) : (
                    "Start Battle ⚔️"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

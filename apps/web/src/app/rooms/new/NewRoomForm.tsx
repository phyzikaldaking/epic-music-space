"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { SubscriptionTier } from "@ems/db";
import type { RoomTierLimits } from "@/lib/roomTier";

type Song = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
};

interface Props {
  limits: RoomTierLimits;
  tier: SubscriptionTier;
  songs: Song[];
  liveKitOnline: boolean;
}

export default function NewRoomForm({ limits, tier, songs, liveKitOnline }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [songId, setSongId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        songId: songId || undefined,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string; roomId?: string };

    if (res.status === 409 && data.roomId) {
      router.push(`/rooms/${data.roomId}`);
      return;
    }

    if (!res.ok || !data.id) {
      setSubmitting(false);
      setError(data.error ?? "Couldn't open the room");
      return;
    }

    router.push(`/rooms/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">
          Open a Listening Session
        </p>
        <h1 className="text-3xl font-extrabold">Throw a listening party.</h1>
        <p className="mt-2 text-sm text-white/55">
          Press play, talk between tracks, and watch fans from across the world
          drop into your room. Hand the mic out when you&apos;re ready.
        </p>
      </div>

      {!liveKitOnline && (
        <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
          <span className="font-bold">Live audio not configured yet.</span>{" "}
          You can still create a room and use chat — but the mic stays cold
          until LiveKit env vars are set on the deployment.
        </div>
      )}

      {/* Tier limits */}
      <div className="mb-6 rounded-2xl border border-white/8 bg-white/3 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-white/45">Your plan: {limits.label}</p>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xl font-bold text-brand-300">{limits.maxCapacity}</p>
            <p className="text-xs text-white/40">listeners max</p>
          </div>
          <div>
            <p className="text-xl font-bold text-brand-300">{limits.maxDurationMinutes}m</p>
            <p className="text-xs text-white/40">session length</p>
          </div>
          <div>
            <p className="text-xl font-bold text-brand-300">{limits.canRecord ? "✓" : "—"}</p>
            <p className="text-xs text-white/40">replay drops</p>
          </div>
        </div>
        {tier === "FREE" && (
          <p className="mt-3 text-xs text-white/40">
            Want bigger rooms and replay drops? <a href="/pricing" className="text-brand-300 hover:underline">See plans →</a>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="room-title" className="mb-1 block text-sm font-semibold text-white/70">
            Session title <span className="text-red-400">*</span>
          </label>
          <input
            id="room-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="Album listening party · Friday night"
            className="w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:bg-white/8"
          />
        </div>

        <div>
          <label htmlFor="room-desc" className="mb-1 block text-sm font-semibold text-white/70">
            What you&apos;re playing
          </label>
          <textarea
            id="room-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Hosting a listen for the new EP. Tap in, leave a comment, or raise a hand to talk."
            className="w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:bg-white/8 resize-none"
          />
        </div>

        {songs.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold text-white/70">Featured track (optional)</p>
            <p className="mb-3 text-xs text-white/40">
              Highlight a track for one-tap licensing in your room.
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setSongId("")}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
                  songId === ""
                    ? "border-brand-500/60 bg-brand-500/10"
                    : "border-white/10 bg-white/3 hover:bg-white/6"
                }`}
              >
                <span className="text-white/60">No featured track</span>
              </button>
              {songs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSongId(s.id)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    songId === s.id
                      ? "border-brand-500/60 bg-brand-500/10"
                      : "border-white/10 bg-white/3 hover:bg-white/6"
                  }`}
                >
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-white/8">
                    {s.coverUrl ? (
                      <Image src={s.coverUrl} alt={s.title} fill sizes="40px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm">🎵</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.title}</p>
                    <p className="truncate text-xs text-white/45">{s.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-4 text-base font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Opening room..." : "Go Live →"}
        </button>
      </form>
    </div>
  );
}

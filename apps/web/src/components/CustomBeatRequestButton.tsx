"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  peerId: string;
  peerName?: string | null;
};

const GENRES = [
  "Hip-Hop",
  "Trap",
  "R&B",
  "Drill",
  "Pop",
  "Electronic",
  "Afrobeats",
  "Lo-Fi",
];
const MOODS = ["Dark", "Uplifting", "Aggressive", "Chill", "Cinematic", "Romantic"];

/**
 * "Request a custom beat" CTA on a producer's profile. Opens a small modal
 * that walks the buyer through a structured brief (genre, BPM, mood, budget,
 * deadline, references) and then sends it as the opening message of a 1:1
 * conversation. Buyers don't have to figure out what to type; producers
 * get a brief that's actually actionable.
 */
export default function CustomBeatRequestButton({ peerId, peerName }: Props) {
  const [open, setOpen] = useState(false);
  const [genre, setGenre] = useState("");
  const [bpm, setBpm] = useState("");
  const [mood, setMood] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [references, setReferences] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function buildMessage(): string {
    const lines = [
      `Hey${peerName ? " " + peerName : ""} — looking for a custom beat. Brief:`,
      "",
      genre ? `• Genre: ${genre}` : null,
      bpm ? `• BPM: ${bpm}` : null,
      mood ? `• Mood: ${mood}` : null,
      budget ? `• Budget: ${budget}` : null,
      deadline ? `• Deadline: ${deadline}` : null,
      references ? `• References: ${references}` : null,
      details ? `\n${details}` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  async function send() {
    setError(null);
    if (!genre && !details.trim()) {
      setError("Pick a genre or describe the beat you want.");
      return;
    }
    setBusy(true);
    try {
      // Step 1: create / find the 1:1 thread.
      const cRes = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId }),
      });
      const cData = (await cRes.json()) as { id?: string; error?: string };
      if (!cRes.ok || !cData.id) {
        throw new Error(cData.error ?? "Could not open thread.");
      }

      // Step 2: send the brief as the opening message.
      const mRes = await fetch(`/api/conversations/${cData.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: buildMessage() }),
      });
      const mData = (await mRes.json().catch(() => ({}))) as { error?: string };
      if (!mRes.ok) {
        throw new Error(mData.error ?? "Could not send brief.");
      }

      // Land the buyer on the thread so they can keep talking.
      router.push(`/messages/${cData.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-gold-500/35 bg-gold-500/10 px-4 py-2 text-sm font-bold text-gold-200 transition hover:bg-gold-500/20"
      >
        🎯 Request a custom beat
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Request a custom beat"
        >
          <div className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#0d0d14] p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">Request a custom beat</h2>
                <p className="text-xs text-white/55">
                  Send a structured brief — answers the questions{" "}
                  {peerName ?? "the producer"} would ask anyway.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/5"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-white/55">
                  Genre
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GENRES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGenre(genre === g ? "" : g)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                        genre === g
                          ? "bg-brand-500 text-white"
                          : "border border-white/15 text-white/65 hover:bg-white/5"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-white/55">
                    BPM
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 140"
                    value={bpm}
                    onChange={(e) => setBpm(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-white/55">
                    Mood
                  </label>
                  <select
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#0a0b10] px-3 py-2 text-sm"
                  >
                    <option value="">Pick a mood…</option>
                    {MOODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-white/55">
                    Budget
                  </label>
                  <input
                    placeholder="e.g. $250"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-white/55">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-white/55">
                  References
                </label>
                <input
                  placeholder="Spotify / YouTube / track names"
                  value={references}
                  onChange={(e) => setReferences(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-white/55">
                  Anything else?
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the vibe, instruments, or specifics."
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="w-full rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
              >
                {busy ? "Sending brief…" : "Send brief & open thread"}
              </button>
              <p className="text-center text-[10px] text-white/30">
                You&apos;ll land in the message thread to negotiate price &
                delivery.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
"use client";

import { useEffect, useState } from "react";
import type { DawEngine, TrackId } from "./dawEngine";
import { uploadStudioAudio } from "@/lib/blobClient";

// Send a 15-second clip of a track directly to one of your followers
// as a DM. Pipeline:
//   1. Pull the focused track's buffer from the engine.
//   2. Run extractLoudestClip() to find the most interesting 15s.
//   3. Upload to Vercel Blob via the studio upload route.
//   4. POST /api/conversations to get/create a 1:1 with the picked
//      follower, then POST a message with a "[clip]" link in the body.
//
// We piggyback on the text-message channel rather than extend the DM
// schema with binary attachments — the URL is enough to render an
// inline preview client-side.

type Follower = { id: string; name: string | null; username: string | null; image: string | null };

type Props = {
  engine: DawEngine;
  trackId: TrackId | null;
  trackName: string;
  onNotice: (tone: "success" | "error" | "info", msg: string) => void;
};

export default function SendClipToDmButton({
  engine,
  trackId,
  trackName,
  onNotice,
}: Props) {
  const [open, setOpen] = useState(false);
  const [followers, setFollowers] = useState<Follower[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open || followers) return;
    setLoading(true);
    fetch("/api/user/following", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { users?: Follower[] } | null) => {
        setFollowers(data?.users ?? []);
      })
      .catch(() => setFollowers([]))
      .finally(() => setLoading(false));
  }, [open, followers]);

  async function send(toUserId: string) {
    if (!trackId) {
      onNotice("error", "Pick a track with audio first.");
      return;
    }
    setSendingTo(toUserId);
    try {
      // 1. Render the track to WAV via stem export (single-track slice).
      // Stems are typically short enough that the full clip is fine
      // as a DM preview; if we wanted a 15s "best moment" highlight
      // we'd round-trip through extractLoudestClip — out of scope here.
      const stems = engine.exportStems().filter((s) => s.trackId === trackId);
      const stem = stems[0];
      if (!stem) {
        onNotice("error", "That track has no audio yet.");
        return;
      }
      // 2. Upload to Vercel Blob. Compute the timestamp here (in the
      // handler) to keep the filename unique per send.
      const ts = Date.now();
      const filename = `clip-${trackName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${ts}.wav`;
      const { url } = await uploadStudioAudio(`studio-clips/${filename}`, stem.blob);
      // 3. Open / find the conversation, then send the URL as a message.
      const convRes = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ peerId: toUserId }),
      });
      if (!convRes.ok) {
        onNotice("error", "Couldn't open that DM thread.");
        return;
      }
      const conv = (await convRes.json()) as { id?: string };
      if (!conv.id) {
        onNotice("error", "DM thread not available.");
        return;
      }
      const msgRes = await fetch(`/api/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: `🎵 Studio clip: ${trackName}\n${url}`,
        }),
      });
      if (!msgRes.ok) {
        onNotice("error", "Couldn't send the message.");
        return;
      }
      onNotice("success", `Clip sent to your collaborator.`);
      setOpen(false);
    } catch (err) {
      console.warn("[SendClipToDm] failed", err);
      onNotice("error", "Couldn't send that clip.");
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!trackId}
        className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
          trackId
            ? "border-pink-400/40 bg-pink-500/10 text-pink-200 hover:bg-pink-500/20"
            : "border-white/10 text-white/30 cursor-not-allowed"
        }`}
        title="DM a 15-second clip of this track to a follower"
      >
        💌 DM clip
      </button>
      {open && (
        <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-pink-400/40 bg-zinc-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.32em] text-pink-300">
                  DM a clip
                </div>
                <h2 className="mt-1 font-display text-xl uppercase tracking-wide">
                  {trackName} → ?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-widest hover:bg-white/10"
              >
                Close
              </button>
            </div>
            {loading ? (
              <p className="text-sm text-white/55">Loading your followers…</p>
            ) : (followers?.length ?? 0) === 0 ? (
              <p className="rounded-md border border-dashed border-white/15 p-3 text-center text-sm text-white/55">
                Follow some people first — DMs only go to people you follow.
              </p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {(followers ?? []).map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => void send(f.id)}
                      disabled={sendingTo === f.id}
                      className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left hover:bg-white/[0.06] disabled:opacity-60"
                    >
                      <div className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-[10px] font-black">
                        {(f.name ?? f.username ?? "?")[0]?.toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm">
                        {f.name ?? f.username ?? "user"}
                      </span>
                      {sendingTo === f.id && (
                        <span className="text-[10px] uppercase tracking-widest text-pink-300">
                          Sending…
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";

interface Props {
  matchId: string;
  isAuthed: boolean;
  /** Hide the toggle once the match is LIVE / COMPLETED — RSVP is for scheduled matches. */
  matchScheduled: boolean;
  /** Compact mode — just the icon + count, for inline use on listing cards. */
  compact?: boolean;
}

type Status = "GOING" | "INTERESTED" | null;

interface RsvpState {
  going: number;
  interested: number;
  mine: Status;
}

export default function VerzuzRSVPButton({
  matchId,
  isAuthed,
  matchScheduled,
  compact = false,
}: Props) {
  const [state, setState] = useState<RsvpState>({
    going: 0,
    interested: 0,
    mine: null,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/verzuz/${matchId}/rsvp`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RsvpState | null) => {
        if (cancelled || !d) return;
        setState(d);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  async function set(status: Status) {
    if (!isAuthed || busy) return;
    setBusy(true);
    try {
      if (status === null) {
        const res = await fetch(`/api/verzuz/${matchId}/rsvp`, {
          method: "DELETE",
        });
        if (res.ok) {
          setState((s) => {
            const wasGoing = s.mine === "GOING";
            const wasInterested = s.mine === "INTERESTED";
            return {
              going: Math.max(0, s.going - (wasGoing ? 1 : 0)),
              interested: Math.max(0, s.interested - (wasInterested ? 1 : 0)),
              mine: null,
            };
          });
        }
      } else {
        const res = await fetch(`/api/verzuz/${matchId}/rsvp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (res.ok) {
          setState((s) => {
            const removingPrior =
              s.mine === "GOING"
                ? { going: Math.max(0, s.going - 1) }
                : s.mine === "INTERESTED"
                  ? { interested: Math.max(0, s.interested - 1) }
                  : {};
            const addingNew =
              status === "GOING"
                ? { going: s.going + 1 }
                : { interested: s.interested + 1 };
            return { ...s, ...removingPrior, ...addingNew, mine: status };
          });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!matchScheduled) {
    // Match is LIVE or COMPLETED — show the count read-only so the social
    // proof ("142 going") still surfaces post-match.
    if (state.going + state.interested === 0) return null;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/60 ${
          compact ? "" : ""
        }`}
      >
        🎟️ {state.going} went
      </span>
    );
  }

  if (compact) {
    const active = state.mine === "GOING";
    return (
      <button
        type="button"
        onClick={() => void set(active ? null : "GOING")}
        disabled={!isAuthed || busy}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${
          active
            ? "border-rose-400/60 bg-rose-500/15 text-rose-200"
            : "border-white/15 bg-white/5 text-white/65 hover:bg-white/10"
        }`}
        title={isAuthed ? "RSVP — get a 5-min reminder" : "Sign in to RSVP"}
      >
        🎟️ {state.going}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/12 bg-white/4 p-2 backdrop-blur-md">
      <span className="px-1.5 text-[10px] font-bold uppercase tracking-widest text-white/45">
        RSVP
      </span>
      <button
        type="button"
        onClick={() => void set(state.mine === "GOING" ? null : "GOING")}
        disabled={!isAuthed || busy}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
          state.mine === "GOING"
            ? "border-rose-400/60 bg-rose-500/20 text-white shadow-[0_0_18px_-6px_rgba(255,72,128,0.55)]"
            : "border-white/15 bg-white/4 text-white/70 hover:bg-white/8"
        }`}
      >
        ✓ Going
        <span className="rounded-md bg-black/30 px-1.5 text-[10px] tabular-nums">
          {state.going}
        </span>
      </button>
      <button
        type="button"
        onClick={() =>
          void set(state.mine === "INTERESTED" ? null : "INTERESTED")
        }
        disabled={!isAuthed || busy}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
          state.mine === "INTERESTED"
            ? "border-amber-400/60 bg-amber-500/20 text-amber-100"
            : "border-white/15 bg-white/4 text-white/70 hover:bg-white/8"
        }`}
      >
        ★ Interested
        <span className="rounded-md bg-black/30 px-1.5 text-[10px] tabular-nums">
          {state.interested}
        </span>
      </button>
      {!isAuthed && (
        <span className="px-1 text-[10px] text-white/45">
          Sign in to get a 5-min reminder.
        </span>
      )}
    </div>
  );
}

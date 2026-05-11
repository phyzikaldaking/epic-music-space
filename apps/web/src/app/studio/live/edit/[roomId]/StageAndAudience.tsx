"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  startYjsCollab,
  observeBeatSteps,
  readSharedFields,
  getSharedProject,
} from "@/lib/yjsBridge";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";
import type * as Y from "yjs";
import MoneyThrowLayer from "./MoneyThrowLayer";

// Stage + audience view for live studio sessions. Host + speakers
// edit the Yjs doc; audience reacts (🔥), votes on polls, raises
// hand to request the stage, and "throws money on stage" — a Stripe
// Checkout that animates as a bill arcing from the audience seat
// to a stage avatar when the webhook clears.

type StageSeat = {
  userId: string;
  role: "HOST" | "SPEAKER";
  name: string;
  image: string | null;
};
type AudienceSeat = {
  userId: string;
  name: string;
  image: string | null;
  handRaised: boolean;
};

type Props = {
  roomId: string;
  roomTitle: string;
  hostId: string;
  stageLimit: number;
  audienceLimit: number;
  tierLabel: string;
  studioProject: { id: string; name: string; bpm: number } | null;
  viewer: { id: string; role: string };
  initialStage: StageSeat[];
  initialAudience: AudienceSeat[];
  initialHandRaises: string[];
};

const LANES = [
  "kick",
  "snare",
  "clap",
  "hat",
  "openHat",
  "perc",
  "bass808",
  "crash",
] as const;

const LANE_COLORS: Record<string, string> = {
  kick: "bg-red-500",
  snare: "bg-amber-500",
  clap: "bg-violet-400",
  hat: "bg-cyan-400",
  openHat: "bg-sky-400",
  perc: "bg-emerald-500",
  bass808: "bg-pink-500",
  crash: "bg-yellow-400",
};

const REACTIONS = ["🔥", "❤️", "👏", "😮", "🎧", "💯"] as const;

// Tip amount presets the audience can throw at the stage. The "OTHER"
// path opens a small custom-input modal.
const TIP_AMOUNTS = [1, 5, 10, 25, 50] as const;

type Reaction = {
  id: string;
  kind: string;
  at: number;
  // Stable horizontal jitter assigned at creation time so each
  // render of the reaction layer is pure (no Math.random() inside
  // render — React 19 + the compiler flag both flag that).
  leftPct: number;
};

type MoneyThrow = {
  id: string;
  fromUserId: string;
  toUserId: string | null;
  amountUsd: number;
};

type Poll = {
  id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  closesAt: string | null;
  tallies: Record<string, number>;
  myVote: string | null;
  totalVotes: number;
};

export default function StageAndAudience({
  roomId,
  roomTitle,
  hostId,
  stageLimit,
  audienceLimit,
  tierLabel,
  studioProject,
  viewer,
  initialStage,
  initialAudience,
  initialHandRaises,
}: Props) {
  const [stage, setStage] = useState<StageSeat[]>(initialStage);
  const [audience, setAudience] = useState<AudienceSeat[]>(initialAudience);
  const [handRaises, setHandRaises] = useState<Set<string>>(
    () => new Set(initialHandRaises),
  );
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [moneyThrows, setMoneyThrows] = useState<MoneyThrow[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [bpm, setBpm] = useState<number | null>(studioProject?.bpm ?? null);
  const [kit, setKit] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [chatBody, setChatBody] = useState("");
  const [chatLines, setChatLines] = useState<
    Array<{ id: string; userId: string; body: string; at: number }>
  >([]);
  const [tipTarget, setTipTarget] = useState<StageSeat | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState<{
    question: string;
    options: string[];
  } | null>(null);

  const isOnStage =
    viewer.role === "HOST" || viewer.role === "SPEAKER";
  const isHost = viewer.id === hostId;
  const myHandRaised = handRaises.has(viewer.id);

  // Declared up here so the supabase channel effect below can call
  // it. Pulls fresh participant data when the role-change broadcast
  // lands (we don't carry user details on the broadcast itself).
  const refreshParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`, { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        participants?: Array<{
          userId: string;
          role: "HOST" | "SPEAKER" | "LISTENER";
          handRaised: boolean;
          user: { id: string; name: string | null; username: string | null; image: string | null };
        }>;
      };
      const parts = data.participants ?? [];
      setStage(
        parts
          .filter((p) => p.role !== "LISTENER")
          .map((p) => ({
            userId: p.userId,
            role: p.role as "HOST" | "SPEAKER",
            name: p.user.name ?? p.user.username ?? "guest",
            image: p.user.image,
          })),
      );
      setAudience(
        parts
          .filter((p) => p.role === "LISTENER")
          .map((p) => ({
            userId: p.userId,
            name: p.user.name ?? p.user.username ?? "guest",
            image: p.user.image,
            handRaised: p.handRaised,
          })),
      );
    } catch {
      // network blip — ignore
    }
  }, [roomId]);

  // ── Yjs ─────────────────────────────────────────────────────────
  // Mount the Yjs doc only when there's a linked studio project. The
  // collab-token endpoint already enforces stage-vs-audience write
  // permissions — we just observe the doc for live render.
  useEffect(() => {
    if (!studioProject) return;
    const handle = startYjsCollab(studioProject.id);

    const initial = readSharedFields(handle.doc);
    if (typeof initial.bpm === "number") setBpm(initial.bpm);
    if (typeof initial.beatKit === "string") setKit(initial.beatKit);
    if (initial.beatSteps) setSteps({ ...initial.beatSteps });

    const sharedMap = getSharedProject(handle.doc) as Y.Map<unknown>;
    const onShared = () => {
      const fields = readSharedFields(handle.doc);
      if (typeof fields.bpm === "number") setBpm(fields.bpm);
      if (typeof fields.beatKit === "string") setKit(fields.beatKit);
    };
    sharedMap.observe(onShared);

    const unsubBeatSteps = observeBeatSteps(handle.doc, (changes) => {
      setSteps((prev) => {
        const next = { ...prev };
        for (const c of changes) next[c.key] = c.on;
        return next;
      });
    });

    return () => {
      sharedMap.unobserve(onShared);
      unsubBeatSteps();
      handle.destroy();
    };
  }, [studioProject]);

  // ── Supabase room channel ───────────────────────────────────────
  // Single channel handles every realtime event: chat messages,
  // reactions, hand raises, role flips, polls, paid tips. We
  // demultiplex by event name below.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase.channel(CHANNELS.room(roomId), {
      config: { broadcast: { self: true } },
    });

    channel.on("broadcast", { event: "reaction" }, ({ payload }) => {
      const p = payload as { kind?: string; at?: number };
      if (!p?.kind) return;
      const entry: Reaction = {
        id: `${Date.now()}-${Math.random()}`,
        kind: p.kind,
        at: p.at ?? Date.now(),
        leftPct: 10 + Math.random() * 80,
      };
      setReactions((prev) => [...prev, entry]);
      // Auto-expire so the layer doesn't unbounded-grow.
      window.setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== entry.id));
      }, 2500);
    });

    channel.on("broadcast", { event: "tip.paid" }, ({ payload }) => {
      const p = payload as {
        tipId?: string;
        tipperId?: string;
        recipientId?: string | null;
        amountUsd?: number;
      };
      if (!p?.tipId || !p.tipperId) return;
      const m: MoneyThrow = {
        id: p.tipId,
        fromUserId: p.tipperId,
        toUserId: p.recipientId ?? null,
        amountUsd: p.amountUsd ?? 1,
      };
      setMoneyThrows((prev) => [...prev, m]);
      window.setTimeout(() => {
        setMoneyThrows((prev) => prev.filter((x) => x.id !== m.id));
      }, 4000);
    });

    channel.on("broadcast", { event: "hand" }, ({ payload }) => {
      const p = payload as { userId?: string; raised?: boolean };
      if (!p?.userId) return;
      setHandRaises((prev) => {
        const next = new Set(prev);
        if (p.raised) next.add(p.userId!);
        else next.delete(p.userId!);
        return next;
      });
    });

    channel.on("broadcast", { event: "role" }, ({ payload }) => {
      const p = payload as { userId?: string; role?: string };
      if (!p?.userId || !p.role) return;
      // The browser doesn't have user details for newly-promoted
      // listeners — refetch the participant list.
      void refreshParticipants();
    });

    channel.on("broadcast", { event: "message" }, ({ payload }) => {
      const p = payload as { userId?: string; body?: string; messageId?: string };
      if (!p?.userId || !p.body) return;
      setChatLines((prev) =>
        [
          ...prev,
          {
            id: p.messageId ?? `${Date.now()}-${Math.random()}`,
            userId: p.userId!,
            body: p.body!,
            at: Date.now(),
          },
        ].slice(-100),
      );
    });

    channel.on("broadcast", { event: "poll.created" }, ({ payload }) => {
      const p = payload as { poll?: Poll };
      if (!p?.poll) return;
      setPolls((prev) => [
        { ...p.poll!, tallies: {}, myVote: null, totalVotes: 0 },
        ...prev,
      ]);
    });

    channel.on("broadcast", { event: "poll.voted" }, ({ payload }) => {
      const p = payload as { pollId?: string; optionId?: string; userId?: string };
      if (!p?.pollId || !p.optionId) return;
      setPolls((prev) =>
        prev.map((poll) => {
          if (poll.id !== p.pollId) return poll;
          const next = { ...poll, tallies: { ...poll.tallies } };
          // Naive +1 — for re-votes we'd need the previous selection
          // to decrement, but the upsert path makes that complex; the
          // GET endpoint reconciles correctly on next refresh.
          next.tallies[p.optionId!] = (next.tallies[p.optionId!] ?? 0) + 1;
          next.totalVotes += 1;
          if (p.userId === viewer.id) next.myVote = p.optionId!;
          return next;
        }),
      );
    });

    channel.on("broadcast", { event: "poll.closed" }, ({ payload }) => {
      const p = payload as { pollId?: string };
      if (!p?.pollId) return;
      setPolls((prev) => prev.filter((poll) => poll.id !== p.pollId));
    });

    void channel.subscribe();

    // Pull current open polls on mount so a late joiner sees them.
    void fetch(`/api/rooms/${roomId}/polls`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { polls?: Poll[] } | null) => {
        if (data?.polls) setPolls(data.polls);
      })
      .catch(() => {});

    return () => {
      void channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Action handlers ─────────────────────────────────────────────

  const sendReaction = useCallback(
    async (kind: string) => {
      await fetch(`/api/rooms/${roomId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind }),
      }).catch(() => {});
    },
    [roomId],
  );

  const toggleHand = useCallback(async () => {
    const next = !myHandRaised;
    setHandRaises((prev) => {
      const s = new Set(prev);
      if (next) s.add(viewer.id);
      else s.delete(viewer.id);
      return s;
    });
    await fetch(`/api/rooms/${roomId}/raise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ raised: next }),
    }).catch(() => {});
  }, [myHandRaised, roomId, viewer.id]);

  const promote = useCallback(
    async (userId: string) => {
      const res = await fetch(`/api/rooms/${roomId}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Couldn't promote");
        return;
      }
      void refreshParticipants();
    },
    [refreshParticipants, roomId],
  );

  const demote = useCallback(
    async (userId: string) => {
      await fetch(`/api/rooms/${roomId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      }).catch(() => {});
      void refreshParticipants();
    },
    [refreshParticipants, roomId],
  );

  const throwMoney = useCallback(
    async (amount: number, recipientId: string | null, note?: string) => {
      const res = await fetch(`/api/rooms/${roomId}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount,
          recipientId: recipientId ?? undefined,
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Tip failed");
        return;
      }
      const data = (await res.json()) as { checkoutUrl?: string };
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    [roomId],
  );

  const sendChat = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const body = chatBody.trim();
      if (!body) return;
      setChatBody("");
      await fetch(`/api/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      }).catch(() => {});
    },
    [chatBody, roomId],
  );

  const createPoll = useCallback(async () => {
    if (!pollDraft) return;
    const opts = pollDraft.options.filter((o) => o.trim().length > 0);
    if (opts.length < 2) return alert("Need at least 2 options");
    const res = await fetch(`/api/rooms/${roomId}/polls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        question: pollDraft.question.trim(),
        options: opts,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "Poll failed");
      return;
    }
    setPollDraft(null);
  }, [pollDraft, roomId]);

  const votePoll = useCallback(
    async (pollId: string, optionId: string) => {
      await fetch(`/api/rooms/${roomId}/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ optionId }),
      }).catch(() => {});
    },
    [roomId],
  );

  // Build a seat-id → DOM ref map so MoneyThrowLayer can resolve
  // start + end positions for the bill arc animation.
  const seatRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const setSeatRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    seatRefs.current.set(id, el);
  }, []);

  const stageUserIds = useMemo(() => new Set(stage.map((s) => s.userId)), [stage]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="relative mx-auto max-w-6xl px-4 pb-32 pt-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
            Studio · live
          </p>
          <h1 className="mt-1 font-display text-2xl uppercase tracking-wide">
            {roomTitle}
          </h1>
          <p className="mt-1 text-xs text-white/55">
            {studioProject ? `Producing ${studioProject.name}` : "Open session"} ·{" "}
            {bpm ? `${bpm} BPM` : "—"} {kit ? `· ${kit}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan-100">
            {tierLabel} room
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/55">
            Stage {stage.length}/{stageLimit} · Audience {audience.length}/{audienceLimit}
          </span>
        </div>
      </header>

      {/* ── Stage ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.08] to-transparent p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">
            On stage
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/45">
            Edits the beat · publishes audio
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {stage.map((s) => (
            <div
              key={s.userId}
              ref={setSeatRef(s.userId)}
              className="relative flex w-28 flex-col items-center rounded-2xl border border-amber-400/40 bg-black/40 p-3"
            >
              {s.image ? (
                <Image
                  src={s.image}
                  alt={s.name}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-lg font-black">
                  {s.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="mt-2 line-clamp-1 text-xs font-semibold">{s.name}</div>
              <div className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-amber-300/80">
                {s.role === "HOST" ? "Host" : "Stage"}
              </div>
              {!isOnStage && s.userId !== viewer.id ? (
                <button
                  onClick={() => setTipTarget(s)}
                  className="mt-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-black hover:bg-emerald-400"
                >
                  💸 Throw
                </button>
              ) : null}
              {isHost && s.userId !== viewer.id ? (
                <button
                  onClick={() => demote(s.userId)}
                  className="mt-1 rounded-full border border-white/15 px-2 py-0.5 text-[9px] uppercase tracking-widest text-white/70 hover:bg-white/10"
                  title="Demote to audience"
                >
                  ↓ Demote
                </button>
              ) : null}
            </div>
          ))}
          {Array.from({ length: Math.max(0, stageLimit - stage.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="grid w-28 place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[10px] uppercase tracking-widest text-white/30"
            >
              Empty seat
            </div>
          ))}
        </div>
      </section>

      {/* ── Beat grid (read-only mirror of Yjs doc) ───────────────── */}
      {studioProject ? (
        <section className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
              Beat — live
            </span>
            <span className="text-[10px] uppercase tracking-widest text-white/45">
              {isOnStage ? "Tap to edit (sends to all stage seats)" : "Read-only"}
            </span>
          </div>
          <div className="space-y-1.5">
            {LANES.map((lane) => (
              <div key={lane} className="flex items-center gap-2">
                <div
                  className={`w-14 shrink-0 text-[11px] font-black uppercase tracking-widest ${
                    LANE_COLORS[lane]?.replace("bg-", "text-") ?? "text-white/70"
                  }`}
                >
                  {lane}
                </div>
                <div className="flex flex-1 gap-[3px]">
                  {Array.from({ length: 16 }, (_, step) => {
                    const on = Boolean(steps[`${lane}:${step}`]);
                    const isDownbeat = step % 4 === 0;
                    return (
                      <div
                        key={step}
                        className={`relative h-7 flex-1 overflow-hidden rounded-md border ${
                          on
                            ? `border-transparent ${LANE_COLORS[lane] ?? "bg-white/40"}`
                            : isDownbeat
                              ? "border-white/15 bg-white/[0.04]"
                              : "border-white/10 bg-white/[0.02]"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Polls ────────────────────────────────────────────────── */}
      {polls.length > 0 ? (
        <section className="mt-6 space-y-3">
          {polls.map((poll) => {
            const total = Math.max(1, poll.totalVotes);
            return (
              <div
                key={poll.id}
                className="rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4"
              >
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
                  Live poll
                </div>
                <p className="mb-3 text-sm font-semibold">{poll.question}</p>
                <div className="space-y-1.5">
                  {poll.options.map((opt) => {
                    const count = poll.tallies[opt.id] ?? 0;
                    const pct = Math.round((count / total) * 100);
                    const picked = poll.myVote === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => votePoll(poll.id, opt.id)}
                        className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition ${
                          picked
                            ? "border-cyan-400 bg-cyan-500/20"
                            : "border-white/15 bg-white/[0.04] hover:bg-white/10"
                        }`}
                      >
                        <div
                          aria-hidden
                          className="absolute inset-y-0 left-0 bg-cyan-500/15"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center justify-between">
                          <span>{opt.label}</span>
                          <span className="text-xs text-white/60">
                            {count} · {pct}%
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* ── Audience + hand-raise queue ─────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.32em] text-white/55">
            Audience ({audience.length})
          </span>
          {!isOnStage ? (
            <button
              onClick={toggleHand}
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                myHandRaised
                  ? "bg-amber-400 text-black"
                  : "border border-white/20 text-white hover:bg-white/10"
              }`}
            >
              {myHandRaised ? "✋ Hand raised" : "✋ Raise hand"}
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
          {audience.slice(0, 60).map((a) => (
            <div
              key={a.userId}
              ref={setSeatRef(a.userId)}
              className="relative flex flex-col items-center"
              title={a.name}
            >
              {a.image ? (
                <Image
                  src={a.image}
                  alt={a.name}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover opacity-80"
                />
              ) : (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[10px] font-black">
                  {a.name.charAt(0).toUpperCase()}
                </div>
              )}
              {handRaises.has(a.userId) ? (
                <div className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-amber-400 text-[9px]">
                  ✋
                </div>
              ) : null}
              {isHost && handRaises.has(a.userId) ? (
                <button
                  onClick={() => promote(a.userId)}
                  className="mt-1 rounded-full bg-amber-400 px-1.5 py-[1px] text-[8px] font-black uppercase tracking-widest text-black"
                >
                  → Stage
                </button>
              ) : null}
            </div>
          ))}
          {audience.length > 60 ? (
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-[10px] font-semibold text-white/55">
              +{audience.length - 60}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Chat ─────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.32em] text-white/55">
          Chat
        </div>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-2 text-xs">
          {chatLines.length === 0 ? (
            <div className="px-2 py-4 text-center text-[11px] text-white/40">
              Be the first to drop a vibe in chat
            </div>
          ) : (
            chatLines.map((line) => {
              const isStage = stageUserIds.has(line.userId);
              return (
                <div key={line.id} className="px-1 py-0.5">
                  <span
                    className={`mr-1 text-[10px] font-black uppercase tracking-widest ${
                      isStage ? "text-amber-300" : "text-white/55"
                    }`}
                  >
                    {isStage ? "🎤 stage" : "audience"}
                  </span>
                  <span className="text-white/85">{line.body}</span>
                </div>
              );
            })
          )}
        </div>
        <form onSubmit={sendChat} className="mt-2 flex items-center gap-2">
          <input
            value={chatBody}
            onChange={(e) => setChatBody(e.target.value)}
            placeholder="Say something…"
            maxLength={500}
            className="flex-1 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            className="rounded-full border border-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest hover:bg-white/10"
          >
            Send
          </button>
        </form>
      </section>

      {/* ── Sticky bottom action bar ─────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setReactionPickerOpen((x) => !x)}
              className="rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
              aria-haspopup="dialog"
              aria-expanded={reactionPickerOpen ? "true" : "false"}
            >
              🔥 React
            </button>
            {reactionPickerOpen ? (
              <div role="dialog" className="flex items-center gap-1">
                {REACTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      void sendReaction(r);
                      setReactionPickerOpen(false);
                    }}
                    className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-1 text-base hover:bg-white/15"
                  >
                    {r}
                  </button>
                ))}
              </div>
            ) : null}
            {!isOnStage ? (
              <button
                onClick={() => setTipTarget({ userId: "", role: "SPEAKER", name: "stage", image: null })}
                className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black uppercase tracking-widest text-black hover:bg-emerald-400"
              >
                💸 Throw money on stage
              </button>
            ) : null}
            {isOnStage ? (
              <button
                onClick={() =>
                  setPollDraft({ question: "", options: ["", ""] })
                }
                className="rounded-full border border-cyan-400/60 px-3 py-1 text-xs hover:bg-cyan-500/10"
              >
                📊 Drop a poll
              </button>
            ) : null}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/45">
            {isOnStage ? "You're on stage" : "You're in the audience"}
          </div>
        </div>
      </div>

      {/* ── Tip modal ───────────────────────────────────────────── */}
      {tipTarget ? (
        <TipModal
          target={tipTarget}
          onClose={() => setTipTarget(null)}
          onConfirm={(amount, note) => {
            const recipientId = tipTarget.userId || null;
            setTipTarget(null);
            void throwMoney(amount, recipientId, note);
          }}
        />
      ) : null}

      {/* ── Poll-create modal ───────────────────────────────────── */}
      {pollDraft ? (
        <PollModal
          draft={pollDraft}
          onChange={setPollDraft}
          onClose={() => setPollDraft(null)}
          onConfirm={createPoll}
        />
      ) : null}

      {/* ── Floating reactions layer ─────────────────────────────── */}
      <ReactionLayer reactions={reactions} />

      {/* ── Money-throw arc animation ────────────────────────────── */}
      <MoneyThrowLayer throws={moneyThrows} seatRefs={seatRefs} />
    </div>
  );
}

function ReactionLayer({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute text-3xl"
          style={{
            left: `${r.leftPct}%`,
            bottom: "8rem",
            animation: "ems-floatUp 2.4s ease-out forwards",
          }}
        >
          {r.kind}
        </div>
      ))}
    </div>
  );
}

function TipModal({
  target,
  onClose,
  onConfirm,
}: {
  target: StageSeat;
  onClose: () => void;
  onConfirm: (amount: number, note?: string) => void;
}) {
  const [amount, setAmount] = useState<number>(5);
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-emerald-500/40 bg-zinc-950 p-6">
        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.32em] text-emerald-300">
          Throw money
        </div>
        <h2 className="mb-4 font-display text-2xl uppercase tracking-wide">
          {target.userId ? `Tip ${target.name}` : "Tip the whole stage"}
        </h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {TIP_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(a)}
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                amount === a
                  ? "bg-emerald-500 text-black"
                  : "border border-white/20 text-white hover:bg-white/10"
              }`}
            >
              ${a}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={500}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.min(500, Number(e.target.value) || 0)))}
            className="w-20 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-sm"
          />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 140))}
          placeholder="Optional note ('🔥 that snare')"
          rows={2}
          className="mb-4 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(amount, note)}
            className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-black hover:bg-emerald-400"
          >
            💸 Throw ${amount}
          </button>
        </div>
      </div>
    </div>
  );
}

function PollModal({
  draft,
  onChange,
  onClose,
  onConfirm,
}: {
  draft: { question: string; options: string[] };
  onChange: (d: { question: string; options: string[] }) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-zinc-950 p-6">
        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
          New poll
        </div>
        <h2 className="mb-4 font-display text-xl uppercase tracking-wide">
          Drop a question to the room
        </h2>
        <input
          value={draft.question}
          onChange={(e) => onChange({ ...draft, question: e.target.value })}
          placeholder="Which kick?"
          maxLength={140}
          className="mb-3 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
        {draft.options.map((opt, i) => (
          <input
            key={i}
            value={opt}
            onChange={(e) => {
              const next = [...draft.options];
              next[i] = e.target.value;
              onChange({ ...draft, options: next });
            }}
            placeholder={`Option ${i + 1}`}
            maxLength={60}
            className="mb-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
        ))}
        {draft.options.length < 6 ? (
          <button
            onClick={() => onChange({ ...draft, options: [...draft.options, ""] })}
            className="mb-3 text-[11px] uppercase tracking-widest text-cyan-300 hover:underline"
          >
            + Add option
          </button>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-cyan-500 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-black hover:bg-cyan-400"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

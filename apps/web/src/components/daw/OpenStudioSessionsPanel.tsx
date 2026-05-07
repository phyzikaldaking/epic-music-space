"use client";

import { useEffect, useRef, useState } from "react";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Open Studio Sessions — the moat feature competitors can't copy.
 *
 * The artist flips a toggle to "I'm working" and broadcasts their
 * session over a Supabase Realtime channel. Fans following them see
 * the broadcast on the home/feed page (separate listener UI) and can
 * drop into a sidebar chat. Artists watch the chat live as they work.
 *
 * Why uncopyable: this requires a social graph + DAW + presence + a
 * marketplace business model. Spotify can't ship this (no DAW),
 * BandLab can't ship this (no fan economy), Logic Pro can't ship this
 * (no social graph). EMS sits on all three.
 *
 * MVP: chat is broadcast-only (no DB persistence) so no schema work
 * needed. Future: chat persistence, "request seat to add a part",
 * fan-as-co-writer hand-off, fan-vote on creative decisions.
 */

interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  body: string;
  ts: number;
}

interface Props {
  artistId: string;
  artistName: string;
  artistAvatar: string | null;
  /** Number of fans currently in the session (excluding the artist). */
  visitorCount: number;
}

const CHAT_TOPIC_PREFIX = `${CHANNELS.marketplace}:session-chat`;

export default function OpenStudioSessionsPanel({
  artistId,
  artistName,
  artistAvatar: authorAvatar,
  visitorCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    supabaseRef.current = supabase;
    const channel = supabase.channel(`${CHAT_TOPIC_PREFIX}:${artistId}`, {
      config: { broadcast: { self: true } },
    });
    channel.on("broadcast", { event: "message" }, (msg) => {
      const payload = msg.payload as ChatMessage | undefined;
      if (!payload) return;
      // Drop duplicates (broadcasts can replay on reconnect).
      setMessages((prev) =>
        prev.find((p) => p.id === payload.id) ? prev : [...prev.slice(-49), payload],
      );
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [artistId]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    const msg: ChatMessage = {
      id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      authorId: artistId,
      authorName: artistName,
      authorAvatar,
      body,
      ts: Date.now(),
    };
    void channelRef.current?.send({
      type: "broadcast",
      event: "message",
      payload: msg,
    });
    setDraft("");
  }

  return (
    <>
      {/* Floating launcher button — pinned bottom-right, above the
          publish bar. Doubles as a "fans listening" badge when closed. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] right-5 z-40 flex items-center gap-2 rounded-full border border-emerald-400/40 bg-gradient-to-br from-emerald-500/30 via-cyan-500/20 to-transparent px-4 py-3 text-sm font-bold text-emerald-100 shadow-2xl shadow-emerald-500/20 transition hover:border-emerald-400/60 active:scale-[0.98]"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        Open Session
        {visitorCount > 0 && (
          <span className="rounded-full border border-emerald-400/50 bg-emerald-500/30 px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-emerald-50">
            {visitorCount} listening
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l border-white/10 bg-[#0a0a0e]/95 backdrop-blur-xl shadow-[0_0_60px_rgba(16,185,129,0.18)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300/85">
                Open Session
              </p>
              <p className="text-sm font-semibold text-white">
                {visitorCount === 0
                  ? "No listeners yet — share your studio link."
                  : `${visitorCount} listening live`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/65 hover:bg-white/10"
            >
              Close
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="py-12 text-center text-xs text-white/40">
                Chat lights up as fans join. They&apos;ll see what you&apos;re
                working on the moment you flip the switch — every reaction
                shows up here in real time.
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="flex items-start gap-2">
                  {m.authorAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.authorAvatar}
                      alt=""
                      className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-xs">
                      {m.authorName[0]?.toUpperCase() ?? "·"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <span className="font-semibold text-white">{m.authorName}</span>
                      <span className="ml-2 text-white/30">
                        {new Date(m.ts).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                    <p className="mt-0.5 break-words text-sm text-white/85">{m.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-white/10 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Message your listeners…"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-emerald-500/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim()}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-[10px] text-white/35">
              Real-time only — messages aren&apos;t saved. Heart, comment, or
              license a clip you love through the player.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

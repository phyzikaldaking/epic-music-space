"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";

interface ChatMessage {
  id: string;
  userId: string;
  roundNumber: number;
  body: string;
  createdAt: string;
  user: { name: string | null; image: string | null };
}

interface Props {
  matchId: string;
  isAuthed: boolean;
  isArtist: boolean;
  /** When the match is COMPLETED, chat becomes read-only. */
  matchEnded: boolean;
}

const SEND_THROTTLE_MS = 800;
const MESSAGE_BUFFER_LIMIT = 200;

/**
 * Live audience chat for a Verzuz match. Subscribes to the existing
 * `CHANNELS.versus(matchId)` channel for `verzuz_message` /
 * `verzuz_message_hidden` broadcasts and persists each send via the
 * /api/verzuz/[id]/message API. Either of the two participating artists
 * can hide a message via PATCH on the same endpoint.
 */
export default function VerzuzChatPanel({
  matchId,
  isAuthed,
  isArtist,
  matchEnded,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSentRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial fetch (latest 100 visible messages, oldest-first).
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/verzuz/${matchId}/message`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages: ChatMessage[] }) => {
        if (cancelled) return;
        setMessages(d.messages ?? []);
      })
      .catch(() => {
        /* fall through to live-only feed */
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // Subscribe to broadcasts.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel(CHANNELS.versus(matchId))
      .on("broadcast", { event: "verzuz_message" }, ({ payload }) => {
        const msg = (payload as { message?: ChatMessage }).message;
        if (!msg) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const next = [...prev, msg];
          return next.length > MESSAGE_BUFFER_LIMIT
            ? next.slice(next.length - MESSAGE_BUFFER_LIMIT)
            : next;
        });
      })
      .on("broadcast", { event: "verzuz_message_hidden" }, ({ payload }) => {
        const id = (payload as { messageId?: string }).messageId;
        if (!id) return;
        setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [matchId]);

  // Auto-scroll the panel to the latest message when one arrives.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || busy || matchEnded || !isAuthed) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_THROTTLE_MS) return;
    lastSentRef.current = now;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/verzuz/${matchId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setDraft("");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't send. Try again.");
      }
    } catch {
      setError("Couldn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }, [draft, busy, matchEnded, isAuthed, matchId]);

  async function hide(messageId: string) {
    if (!isArtist) return;
    await fetch(`/api/verzuz/${matchId}/message`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    }).catch(() => null);
  }

  return (
    <aside className="flex h-[480px] flex-col rounded-3xl border border-white/12 bg-[#0a0a0e]/75 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/55">
          Live chat
        </p>
        <span className="text-[10px] text-white/40">{messages.length} messages</span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 text-sm"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/40">
            Be the first to say something.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {messages.map((m) => (
              <li
                key={m.id}
                className="group flex items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/4"
              >
                <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                  {m.user.image ? (
                    <Image
                      src={m.user.image}
                      alt=""
                      fill
                      sizes="28px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-black text-white">
                      {(m.user.name ?? "?")[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-white/55">
                    <span className="font-bold text-white/85">
                      {m.user.name ?? "Guest"}
                    </span>
                    <span className="ml-1.5 text-white/35">· R{m.roundNumber}</span>
                  </p>
                  <p className="break-words text-sm text-white/95">{m.body}</p>
                </div>
                {isArtist && (
                  <button
                    type="button"
                    onClick={() => void hide(m.id)}
                    className="invisible flex-shrink-0 rounded text-[10px] font-bold text-white/40 hover:text-red-300 group-hover:visible"
                    aria-label="Hide this message"
                  >
                    Hide
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-white/10 p-3"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            !isAuthed
              ? "Sign in to chat"
              : matchEnded
                ? "Chat closed — match ended"
                : "Drop a comment…"
          }
          maxLength={500}
          disabled={!isAuthed || matchEnded}
          className="flex-1 rounded-xl bg-white/5 px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:bg-white/8 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || !isAuthed || matchEnded || busy}
          className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
      {error && (
        <p className="border-t border-red-500/25 bg-red-500/10 px-4 py-2 text-[11px] text-red-300">
          {error}
        </p>
      )}
    </aside>
  );
}

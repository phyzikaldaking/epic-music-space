/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ReportUserButton from "@/components/ReportUserButton";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";

interface Peer {
  id: string;
  name: string | null;
  image: string | null;
  isVerified?: boolean;
  studio: { username: string } | null;
}

interface MessageRow {
  id: string;
  body: string;
  senderId: string;
  readAt: string | null;
  createdAt: string;
}

export default function ThreadClient({
  conversationId,
  viewerId,
  peer,
}: {
  conversationId: string;
  viewerId: string;
  peer: Peer;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error("Could not load messages.");
      const data = (await res.json()) as { messages: MessageRow[] };
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }

  // Initial load + Supabase realtime subscription. The 5s poll stays as a
  // fallback so a transient WebSocket drop or unconfigured Supabase env
  // never silently freezes the thread. When the channel is healthy the
  // poll is mostly redundant — that's fine; new messages still appear
  // within ~50ms via the broadcast on the send route.
  useEffect(() => {
    void load();
    const supabase = createBrowserSupabaseClient();
    let unsubscribe: (() => void) | null = null;
    if (supabase) {
      const channel = supabase
        .channel(CHANNELS.conversation(conversationId))
        .on("broadcast", { event: "message" }, (payload) => {
          const incoming = (payload?.payload as { message?: MessageRow } | undefined)?.message;
          if (!incoming) return;
          setMessages((prev) => {
            // Dedupe — the sender's own optimistic append already added it.
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        })
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    }
    const t = setInterval(load, 5000);
    return () => {
      clearInterval(t);
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Auto-scroll to the latest message on changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: MessageRow;
        error?: string;
      };
      if (!res.ok || !data.message) throw new Error(data.error ?? "Send failed.");
      setMessages((prev) => [...prev, data.message!]);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  const profileHref = peer.studio?.username ? `/studio/${peer.studio.username}` : "#";

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[480px] flex-col rounded-2xl border border-white/8 studio-faceplate">
      <header className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/55 hover:bg-white/5"
        >
          ←
        </Link>
        <Link href={profileHref} className="flex items-center gap-3">
          <div className="relative h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
            {peer.image ? (
              <Image src={peer.image} alt="" fill unoptimized className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm">🎤</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {peer.name ?? peer.studio?.username ?? "User"}
              {peer.isVerified && (
                <span className="ml-1 text-cyan-300" aria-label="Verified">✓</span>
              )}
            </p>
            {peer.studio?.username && (
              <p className="truncate text-[11px] text-white/40">@{peer.studio.username}</p>
            )}
          </div>
        </Link>
        <div className="ml-auto">
          <ReportUserButton
            reportedUserId={peer.id}
            context={{ kind: "message", id: conversationId }}
            label=""
            className="rounded-lg border border-white/10 bg-white/4 px-2 py-1.5 text-xs text-white/55 hover:bg-white/10"
          />
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/45">
            Say hi — your first message will start the thread.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === viewerId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "bg-brand-500 text-white"
                      : "bg-white/8 text-white/90"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="border-t border-white/8 px-3 py-2"
      >
        {error && (
          <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Send a message…"
            aria-label="Message"
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm focus:border-brand-500/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

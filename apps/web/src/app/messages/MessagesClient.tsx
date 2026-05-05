"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface Peer {
  id: string;
  name: string | null;
  image: string | null;
  isVerified?: boolean;
  studio: { username: string } | null;
}
interface ConversationRow {
  id: string;
  peer: Peer;
  lastMessageAt: string;
  lastMessage: string | null;
  lastMessageMine: boolean;
  unreadCount: number;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function MessagesClient({ viewerId }: { viewerId: string }) {
  void viewerId; // accepted for future per-row affordances
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) throw new Error("Could not load.");
        const data = (await res.json()) as { conversations: ConversationRow[] };
        if (!cancelled) setRows(data.conversations);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-white/40">Loading…</p>;
  if (error) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="mb-3 text-4xl" aria-hidden>💬</p>
        <p className="text-sm font-semibold text-white/85">
          No conversations yet.
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-white/45">
          Tap a profile and choose Message to start a thread.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
      {rows.map((c) => (
        <li key={c.id}>
          <Link
            href={`/messages/${c.id}`}
            className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.04]"
          >
            <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
              {c.peer.image ? (
                <Image src={c.peer.image} alt="" fill unoptimized className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-base">🎤</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate text-sm font-bold">
                  {c.peer.name ?? c.peer.studio?.username ?? "User"}
                  {c.peer.isVerified && (
                    <span className="ml-1 text-cyan-300" aria-label="Verified">✓</span>
                  )}
                </p>
                <span className="ml-auto flex-shrink-0 text-[10px] text-white/35">
                  {timeAgo(c.lastMessageAt)}
                </span>
              </div>
              <p
                className={`mt-0.5 truncate text-xs ${
                  c.unreadCount > 0 && !c.lastMessageMine
                    ? "font-semibold text-white/85"
                    : "text-white/40"
                }`}
              >
                {c.lastMessageMine && c.lastMessage ? "You: " : ""}
                {c.lastMessage ?? "No messages yet"}
              </p>
            </div>
            {c.unreadCount > 0 && !c.lastMessageMine && (
              <span className="ml-2 flex-shrink-0 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {c.unreadCount}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

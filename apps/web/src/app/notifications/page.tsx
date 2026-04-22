"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

const TYPE_ICON: Record<string, string> = {
  LICENSE_SOLD: "🎟️",
  VERSUS_RESULT: "⚔️",
  LABEL_OFFER: "🏷️",
  PAYOUT: "💸",
  TIP: "💛",
  AUCTION_BID: "🔨",
  AUCTION_WIN: "🏆",
  AUCTION_OUTBID: "📣",
  FOLLOW: "👤",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  const load = useCallback(async () => {
    const url = filter === "unread" ? "/api/notifications?unread=true" : "/api/notifications";
    try {
      const res = await fetch(url);
      if (res.ok) setNotifications(await res.json());
    } catch {}
  }, [filter]);

  useEffect(() => {
    if (session) {
      setLoading(true);
      load().finally(() => setLoading(false));
    }
  }, [session, load]);

  async function markAllRead() {
    setMarking(true);
    try {
      await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [] }) });
      await load();
    } finally {
      setMarking(false);
    }
  }

  async function markOneRead(id: string) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Notifications</h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-white/40">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:bg-white/6 disabled:opacity-40"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-white/8 bg-white/[0.02] p-1">
        {(["all", "unread"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              filter === tab
                ? "bg-brand-500 text-white"
                : "text-white/50 hover:text-white"
            }`}
          >
            {tab === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          </button>
        ))}
      </div>

      {notifications.length === 0 ? (
        <div className="py-20 text-center text-white/30">
          <p className="mb-3 text-5xl">🔔</p>
          <p className="text-lg font-semibold">
            {filter === "unread" ? "All caught up!" : "No notifications yet"}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              onClick={() => !n.read && markOneRead(n.id)}
              className={`flex cursor-pointer gap-4 rounded-2xl border p-4 transition ${
                n.read
                  ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                  : "border-brand-500/25 bg-brand-500/6 hover:bg-brand-500/10"
              }`}
            >
              <span className="mt-0.5 flex-shrink-0 text-2xl">
                {TYPE_ICON[n.type] ?? "🔔"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${n.read ? "text-white/70" : "text-white"}`}>
                    {n.title}
                  </p>
                  <span className="flex-shrink-0 text-[10px] text-white/30">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-white/50 leading-snug">{n.body}</p>
              </div>
              {!n.read && (
                <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-brand-400" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

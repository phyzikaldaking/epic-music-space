"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
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
  VERSUS_VOTE: "⚔️",
  VERSUS_RESULT: "⚔️",
  VERZUZ_RESULT: "🏆",
  LABEL_OFFER: "🏷️",
  PAYOUT: "💸",
  TIP: "💛",
  AUCTION_BID: "🔨",
  AUCTION_BID_RECEIVED: "🔨",
  AUCTION_WIN: "🏆",
  AUCTION_OUTBID: "📣",
  IDENTITY_VERIFIED: "✅",
  DM: "✉️",
  FOLLOW: "👤",
  POST_LIKED: "♥",
  POST_COMMENTED: "💬",
  FOLLOWED_POST: "📣",
};

const DIGEST_GROUPS = {
  money: new Set(["LICENSE_SOLD", "PAYOUT", "TIP", "HOLDER_PAYOUT", "LICENSE_HOLDER_EARNED", "REFUND_CLAWBACK", "REFUND_ISSUED"]),
  social: new Set(["FOLLOW", "POST_LIKED", "POST_COMMENTED", "FOLLOWED_POST", "DM"]),
  creator: new Set(["VERSUS_VOTE", "VERSUS_RESULT", "VERZUZ_RESULT", "AUCTION_BID", "AUCTION_BID_RECEIVED", "AUCTION_WIN", "AUCTION_OUTBID"]),
  system: new Set(["IDENTITY_VERIFIED", "STREAM_FRAUD_ALERT"]),
} as const;

function digestBucket(type: string): keyof typeof DIGEST_GROUPS {
  if (DIGEST_GROUPS.money.has(type)) return "money";
  if (DIGEST_GROUPS.social.has(type)) return "social";
  if (DIGEST_GROUPS.creator.has(type)) return "creator";
  return "system";
}

function notifHref(type: string, metadata: Record<string, unknown> | null): string | null {
  const meta = metadata ?? {};
  const matchId = typeof meta.matchId === "string" ? meta.matchId : null;
  const conversationId = typeof meta.conversationId === "string" ? meta.conversationId : null;
  const postId = typeof meta.postId === "string" ? meta.postId : null;
  const songId = typeof meta.songId === "string" ? meta.songId : null;
  if (type.startsWith("VERZUZ") && matchId) return `/verzuz/${matchId}`;
  if (type === "VERSUS_VOTE" && matchId) return `/versus/${matchId}`;
  if (type === "VERSUS_RESULT" && matchId) return `/versus/${matchId}`;
  if (type === "DM" && conversationId) return `/messages/${conversationId}`;
  if (type === "IDENTITY_VERIFIED") return "/dashboard/identity";
  if ((type === "POST_LIKED" || type === "POST_COMMENTED" || type === "FOLLOWED_POST") && postId)
    return `/post/${postId}`;
  if (type.includes("LICENSE") && songId) return `/song/${songId}`;
  if (type.includes("PAYOUT") || type.includes("CONNECT") || type.includes("PAYMENT") || type === "TIP")
    return "/dashboard/earnings";
  if (type.includes("AUCTION") && songId) return `/song/${songId}`;
  return null;
}

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
  const digest = useMemo(() => {
    const out = { money: 0, social: 0, creator: 0, system: 0 };
    for (const n of notifications) out[digestBucket(n.type)] += 1;
    return out;
  }, [notifications]);

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
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-brand-300/85">
            Digest
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-white">Notifications</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Everything that matters, grouped so you can scan money, social, creator activity, and system updates without digging.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={marking}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/6 disabled:opacity-40"
            >
              Mark all read
            </button>
          )}
          <Link
            href="/settings/notifications"
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Notification settings
          </Link>
        </div>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-brand-500/25 bg-brand-500/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-200">Unread</p>
          <p className="mt-2 text-3xl font-black text-white">{unreadCount}</p>
          <p className="mt-1 text-xs text-white/55">Needs your attention now.</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Money</p>
          <p className="mt-2 text-3xl font-black text-white">{digest.money}</p>
          <p className="mt-1 text-xs text-white/55">Payouts, licenses, and cash movement.</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/8 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Social</p>
          <p className="mt-2 text-3xl font-black text-white">{digest.social}</p>
          <p className="mt-1 text-xs text-white/55">Followers, comments, likes, and messages.</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">Creator</p>
          <p className="mt-2 text-3xl font-black text-white">{digest.creator}</p>
          <p className="mt-1 text-xs text-white/55">Battles, auctions, and competition.</p>
        </div>
      </section>

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
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] py-20 text-center text-white/30">
          <p className="mb-3 text-5xl">🔔</p>
          <p className="text-lg font-semibold text-white/75">
            {filter === "unread" ? "All caught up." : "No notifications yet."}
          </p>
          <p className="mt-2 text-sm text-white/45">
            Once activity starts, your digest will land here in clear sections.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              onClick={() => {
                if (!n.read) markOneRead(n.id);
                const href = notifHref(n.type, n.metadata);
                if (href) router.push(href);
              }}
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

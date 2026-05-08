"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export default function NotificationBell() {
  const { status } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/notifications?unread=false");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {
      // silently fail
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications, status]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleOpen() {
    if (status !== "authenticated") return;
    setOpen((v) => !v);
    if (!open && unreadCount > 0) {
      setLoading(true);
      try {
        await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [] }) });
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  }

  if (status !== "authenticated") return null;

  function typeIcon(type: string) {
    if (type.includes("LICENSE")) return "🎵";
    if (type.includes("BOOST")) return "🚀";
    if (type.includes("PAYOUT") || type.includes("CONNECT")) return "💸";
    if (type.includes("PAYMENT")) return "💳";
    if (type.includes("SUBSCRIPTION")) return "⭐";
    if (type.includes("BADGE")) return "🏅";
    if (type === "IDENTITY_VERIFIED") return "✅";
    if (type === "DM") return "✉️";
    if (type === "POST_LIKED") return "♥";
    if (type === "POST_COMMENTED") return "💬";
    if (type === "FOLLOWED_POST") return "📣";
    if (type.includes("FOLLOW")) return "👤";
    if (type.startsWith("VERZUZ")) return "🏆";
    if (type.includes("VERSUS") || type.includes("CHALLENGE")) return "⚔️";
    return "🔔";
  }

  function notifHref(n: Notification): string | null {
    const meta = (n.metadata ?? {}) as Record<string, unknown>;
    const matchId = typeof meta.matchId === "string" ? meta.matchId : null;
    const conversationId = typeof meta.conversationId === "string" ? meta.conversationId : null;
    const postId = typeof meta.postId === "string" ? meta.postId : null;
    const songId = typeof meta.songId === "string" ? meta.songId : null;
    if (n.type.startsWith("VERZUZ") && matchId) return `/verzuz/${matchId}`;
    if (n.type === "VERSUS_VOTE" && matchId) return `/versus/${matchId}`;
    if (n.type === "DM" && conversationId) return `/messages/${conversationId}`;
    if (n.type === "IDENTITY_VERIFIED") return "/dashboard/identity";
    if (n.type === "POST_LIKED" || n.type === "POST_COMMENTED" || n.type === "FOLLOWED_POST") {
      return postId ? `/timeline?post=${postId}` : "/timeline";
    }
    if (n.type.includes("LICENSE") && songId) return `/song/${songId}`;
    if (n.type.includes("PAYOUT") || n.type.includes("CONNECT") || n.type.includes("PAYMENT")) {
      return "/dashboard/earnings";
    }
    if (n.type.includes("SUBSCRIPTION")) return "/dashboard/subscriptions";
    if (n.type.includes("BADGE")) return "/dashboard/badges";
    if (n.type.includes("FOLLOW")) return "/timeline";
    return null;
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        className="relative flex h-8 w-8 items-center justify-center rounded-md studio-faceplate-dark text-white/65 transition hover:text-tube-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="led-on-rec absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile-only backdrop so a tap-outside on phone closes the panel.
              Desktop relies on the existing click-outside handler. */}
          <div
            aria-hidden
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="studio-faceplate fixed inset-x-3 top-16 z-50 mx-auto max-w-sm rounded-xl shadow-2xl shadow-black/60 sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:mx-0 sm:w-80"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span aria-hidden className="led-on-amber h-2 w-2 rounded-full" />
                <span className="studio-label text-tube-300">Notifications</span>
                {unreadCount > 0 && (
                  <span className="led-on-rec rounded-full px-1.5 py-0.5 text-[10px] font-black text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {loading && <span className="text-xs text-white/35">Marking read…</span>}
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="text-[11px] font-semibold text-tube-400 hover:text-tube-300"
                >
                  See all
                </Link>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/5 sm:max-h-[400px]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-white/45">
                  <span aria-hidden className="text-3xl">📭</span>
                  <p className="font-semibold text-white/65">No notifications yet</p>
                  <p className="text-xs text-white/35">
                    Likes, comments, follows, and license sales land here.
                  </p>
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => {
                  const href = notifHref(n);
                  const inner = (
                    <>
                      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/4 text-base ring-1 ring-white/10">
                        {typeIcon(n.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{n.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-white/55">{n.body}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-widest text-white/30">
                          {timeAgo(n.createdAt)}
                        </p>
                      </div>
                      {!n.read && (
                        <span
                          aria-hidden
                          className="led-on-amber ml-1 mt-2 h-2 w-2 flex-shrink-0 rounded-full"
                        />
                      )}
                    </>
                  );
                  const cls = `flex gap-3 px-4 py-3 transition ${
                    n.read ? "opacity-60" : "bg-tube-300/[0.06]"
                  } ${href ? "hover:bg-white/5" : ""}`;
                  return href ? (
                    <Link key={n.id} href={href} onClick={() => setOpen(false)} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id} className={cls}>
                      {inner}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unread=false");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

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

  function typeIcon(type: string) {
    if (type.includes("LICENSE")) return "🎵";
    if (type.includes("BOOST")) return "🚀";
    if (type.includes("PAYOUT") || type.includes("CONNECT")) return "💸";
    if (type.includes("PAYMENT")) return "💳";
    if (type.includes("SUBSCRIPTION")) return "⭐";
    if (type.includes("BADGE")) return "🏅";
    if (type === "POST_LIKED") return "♥";
    if (type === "POST_COMMENTED") return "💬";
    if (type === "FOLLOWED_POST") return "📣";
    if (type.includes("FOLLOW")) return "👤";
    if (type.includes("VERSUS") || type.includes("CHALLENGE")) return "⚔️";
    return "🔔";
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
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/60 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white leading-none">
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
            className="fixed inset-x-3 top-16 z-50 mx-auto max-w-sm rounded-2xl border border-white/15 bg-gradient-to-b from-[#15151c] to-[#0d0d12] shadow-[0_20px_60px_rgba(124,58,237,0.25)] backdrop-blur-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:mx-0 sm:w-80"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-base">🔔</span>
                <span className="text-sm font-bold text-white/85">Notifications</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {loading && <span className="text-xs text-white/35">Marking read…</span>}
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="text-[11px] font-semibold text-brand-400 hover:underline"
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
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 transition ${
                      n.read ? "opacity-60" : "bg-brand-500/8"
                    }`}
                  >
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
                        className="ml-1 mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-accent-400 shadow-[0_0_8px_rgba(0,245,255,0.85)]"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

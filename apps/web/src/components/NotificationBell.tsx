"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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
        <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl border border-white/12 bg-[#111] shadow-2xl shadow-black/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <span className="text-sm font-semibold text-white/80">Notifications</span>
            {loading && <span className="text-xs text-white/30">Marking read…</span>}
          </div>

          <div className="max-h-[400px] overflow-y-auto divide-y divide-white/5">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/30">
                No notifications yet.
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 transition ${n.read ? "opacity-60" : "bg-brand-500/5"}`}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">{typeIcon(n.type)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{n.title}</p>
                    <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-xs text-white/25 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

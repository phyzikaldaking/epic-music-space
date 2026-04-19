"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Heart, MessageCircle, UserPlus, DollarSign, Gavel, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Notification } from "@/types/database";
import { cn } from "@/lib/utils";

const notifIcon = (type: string) => {
  switch (type) {
    case "like": return <Heart size={16} className="text-pink-400" />;
    case "comment": return <MessageCircle size={16} className="text-blue-400" />;
    case "follow": return <UserPlus size={16} className="text-green-400" />;
    case "purchase": return <DollarSign size={16} className="text-green-400" />;
    case "bid": return <Gavel size={16} className="text-orange-400" />;
    default: return <Bell size={16} className="text-purple-400" />;
  }
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push("/login?redirect=/notifications");
      return;
    }

    const supabase = createClient();

    const fetch = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      setNotifications(data ?? []);
      setLoading(false);

      // Mark all as read
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
    };

    fetch();
  }, [user, router]);

  const markAllRead = async () => {
    if (!user) return;
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell size={22} className="text-purple-400" />
            Notifications
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-xs font-semibold">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">Your latest activity</p>
        </div>

        {notifications.some((n) => !n.read) && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <CheckCheck size={16} />
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white/5 border border-white/10 p-4 flex gap-3">
              <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-white/5 rounded animate-pulse w-3/4" />
                <div className="h-2.5 bg-white/5 rounded animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bell size={48} className="text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No notifications yet</h2>
          <p className="text-gray-400 text-sm">
            When people like, comment, or follow you, you&apos;ll see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={cn(
                "rounded-2xl border p-4 flex items-start gap-3 transition-colors",
                notif.read
                  ? "bg-white/3 border-white/8"
                  : "bg-purple-600/10 border-purple-500/20"
              )}
            >
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                {notifIcon(notif.type)}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200">{notif.message}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-gray-500">
                    {new Date(notif.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {notif.song_id && (
                    <Link
                      href={`/song/${notif.song_id}`}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      View track →
                    </Link>
                  )}
                </div>
              </div>

              {!notif.read && (
                <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0 mt-2" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

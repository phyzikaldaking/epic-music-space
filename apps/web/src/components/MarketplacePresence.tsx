"use client";

import { useEffect, useMemo, useState } from "react";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";

type PresenceState = Record<string, Array<{ room?: string; listening?: boolean; online_at?: string }>>;

interface MarketplacePresenceProps {
  roomId?: string;
  label?: string;
  compact?: boolean;
}

export default function MarketplacePresence({ roomId = "marketplace", label = "Live presence", compact = false }: MarketplacePresenceProps) {
  const [onlineCount, setOnlineCount] = useState(0);
  const [listeningCount, setListeningCount] = useState(0);
  const [connected, setConnected] = useState(false);

  const clientId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `ems-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase.channel(`${CHANNELS.marketplace}:${roomId}`, {
      config: { presence: { key: clientId } },
    });

    const updateCounts = () => {
      const state = channel.presenceState() as PresenceState;
      const presences = Object.values(state).flat();
      setOnlineCount(presences.length);
      setListeningCount(presences.filter((presence) => presence.listening).length);
    };

    channel.on("presence", { event: "sync" }, updateCounts);
    channel.on("presence", { event: "join" }, updateCounts);
    channel.on("presence", { event: "leave" }, updateCounts);
    channel.subscribe(async (status) => {
      setConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") {
        await channel.track({ room: roomId, listening: false, online_at: new Date().toISOString() });
      }
    });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [clientId, roomId]);

  if (compact) {
    return (
      <span className="rounded-full border border-accent-300/20 bg-accent-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-accent-100/80">
        {connected ? `${onlineCount} live · ${listeningCount} listening` : "presence standby"}
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent-200">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/7 p-3">
          <p className="text-2xl font-black text-white">{connected ? onlineCount : "--"}</p>
          <p className="text-xs text-white/40">in room</p>
        </div>
        <div className="rounded-xl bg-white/7 p-3">
          <p className="text-2xl font-black text-accent-200">{connected ? listeningCount : "--"}</p>
          <p className="text-xs text-white/40">listening</p>
        </div>
      </div>
    </div>
  );
}

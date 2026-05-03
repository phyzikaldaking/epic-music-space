"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";

type MarketEvent = {
  type: "boost" | "license" | "placement" | "takeover" | "rank_change";
  title?: string;
  artist?: string;
  songId?: string;
  message?: string;
  power?: number;
};

const fallbackEvents: MarketEvent[] = [
  { type: "takeover", title: "Crown Watch", message: "The top slot is under pressure." },
  { type: "boost", title: "Boost Window", message: "Artists are competing for more screen power." },
  { type: "license", title: "License Demand", message: "Purchases can shift the marketplace ranking." },
];

function getEventLabel(type: MarketEvent["type"]) {
  switch (type) {
    case "boost":
      return "Boost";
    case "license":
      return "License";
    case "placement":
      return "Placement";
    case "rank_change":
      return "Rank Change";
    default:
      return "Takeover";
  }
}

export default function RealtimeMarketBridge() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [event, setEvent] = useState<MarketEvent>(fallbackEvents[0]);
  const [connected, setConnected] = useState(false);
  const [flash, setFlash] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const client = useMemo(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    if (!client) {
      const interval = window.setInterval(() => {
        setFallbackIndex((value) => value + 1);
      }, 11000);
      return () => window.clearInterval(interval);
    }

    const channel = client
      .channel(CHANNELS.marketplace)
      .on("broadcast", { event: "market_event" }, ({ payload }) => {
        const nextEvent = payload as MarketEvent;
        setEvent(nextEvent);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 1600);
        startTransition(() => router.refresh());
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, router]);

  useEffect(() => {
    if (client) return;
    setEvent(fallbackEvents[fallbackIndex % fallbackEvents.length]);
    setFlash(true);
    const timeout = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(timeout);
  }, [client, fallbackIndex]);

  return (
    <aside className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] overflow-hidden rounded-3xl border border-white/10 bg-black/75 p-4 text-white shadow-2xl shadow-black/60 backdrop-blur-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.20),transparent_34%),radial-gradient(circle_at_90%_30%,rgba(253,224,71,0.16),transparent_28%)]" />
      {flash && <div className="absolute inset-0 animate-pulse bg-gold-200/10" />}
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-300 shadow-lg shadow-green-300/60" : "bg-gold-300 shadow-lg shadow-gold-300/50"}`} />
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
              {connected ? "Realtime Live" : "Live Simulation"}
            </p>
          </div>
          {isPending && <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100">Refreshing</span>}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">
            {getEventLabel(event.type)} Event
          </p>
          <h3 className="mt-1 line-clamp-1 text-lg font-black tracking-[-0.04em] text-white">
            {event.title ?? "Marketplace Movement"}
          </h3>
          <p className="mt-1 text-sm leading-5 text-white/55">
            {event.message ?? "The floor is moving. Watch the rankings."}
          </p>
          {event.power != null && <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-gold-100">+{event.power} power applied</p>}
        </div>
      </div>
    </aside>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";

type MarketEvent = {
  type: "boost" | "license" | "placement" | "takeover" | "rank_change" | "outbid" | "lost_rank";
  title?: string;
  artist?: string;
  songId?: string;
  message?: string;
  power?: number;
  previousChampion?: string;
  newChampion?: string;
  userId?: string;
  oldRank?: number;
  newRank?: number;
  requiredPower?: number;
  actionUrl?: string;
};

const fallbackEvents: MarketEvent[] = [
  { type: "takeover", title: "Crown Watch", message: "The top slot is under pressure.", newChampion: "Crown Contender" },
  { type: "boost", title: "Boost Window", message: "Artists are competing for more screen power." },
  { type: "license", title: "License Demand", message: "Purchases can shift the marketplace ranking." },
];

function getEventLabel(type: MarketEvent["type"]) {
  switch (type) {
    case "boost": return "Boost";
    case "license": return "License";
    case "placement": return "Placement";
    case "rank_change": return "Rank Change";
    case "outbid": return "Outbid";
    case "lost_rank": return "Lost Rank";
    default: return "Takeover";
  }
}

function isPersonalEvent(event: MarketEvent) {
  return event.type === "outbid" || event.type === "lost_rank";
}

export default function RealtimeMarketBridge({ userId }: { userId?: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [event, setEvent] = useState<MarketEvent>(fallbackEvents[0]);
  const [personalAlert, setPersonalAlert] = useState<MarketEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [flash, setFlash] = useState(false);
  const [takeover, setTakeover] = useState<MarketEvent | null>(null);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const client = useMemo(() => createBrowserSupabaseClient(), []);

  function fireEvent(nextEvent: MarketEvent) {
    setEvent(nextEvent);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);

    if (isPersonalEvent(nextEvent)) {
      setPersonalAlert(nextEvent);
      window.setTimeout(() => setPersonalAlert(null), 9000);
    }

    if (nextEvent.type === "takeover" || nextEvent.newChampion) {
      setTakeover(nextEvent);
      window.setTimeout(() => setTakeover(null), 5200);
    }
  }

  useEffect(() => {
    if (!client) {
      const interval = window.setInterval(() => setFallbackIndex((value) => value + 1), 11000);
      return () => window.clearInterval(interval);
    }

    const marketChannel = client
      .channel(CHANNELS.marketplace)
      .on("broadcast", { event: "market_event" }, ({ payload }) => {
        const nextEvent = payload as MarketEvent;
        fireEvent(nextEvent);
        startTransition(() => router.refresh());
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    let personalChannel: ReturnType<typeof client.channel> | null = null;
    if (userId) {
      personalChannel = client
        .channel(CHANNELS.notifications(userId))
        .on("broadcast", { event: "user_market_alert" }, ({ payload }) => {
          const nextEvent = payload as MarketEvent;
          fireEvent(nextEvent);
          startTransition(() => router.refresh());
        })
        .subscribe();
    }

    return () => {
      void client.removeChannel(marketChannel);
      if (personalChannel) void client.removeChannel(personalChannel);
    };
  }, [client, router, userId]);

  useEffect(() => {
    if (client) return;
    fireEvent(fallbackEvents[fallbackIndex % fallbackEvents.length]);
    return undefined;
  }, [client, fallbackIndex]);

  return (
    <>
      {takeover && (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/72 backdrop-blur-sm">
          <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_50%,rgba(253,224,71,0.34),transparent_34%),radial-gradient(circle_at_50%_80%,rgba(34,211,238,0.22),transparent_42%)]" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-gold-200 to-transparent shadow-[0_0_60px_rgba(253,224,71,0.8)]" />
          <div className="relative mx-4 max-w-4xl rounded-[2.5rem] border border-gold-200/35 bg-black/75 p-8 text-center shadow-2xl shadow-gold-500/20 md:p-12">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full border border-gold-200/35 bg-gold-200/15 text-sm font-black uppercase tracking-[0.16em] text-gold-100 shadow-2xl shadow-gold-500/30">Crown</div>
            <p className="text-xs font-black uppercase tracking-[0.38em] text-gold-100/80">New Champion Takeover</p>
            <h2 className="mt-4 text-5xl font-black leading-[0.88] tracking-[-0.08em] text-white md:text-7xl">{takeover.newChampion ?? takeover.title ?? "New Crown Holder"}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/62">{takeover.message ?? "The marketplace crown just changed hands. Rankings are refreshing now."}</p>
            {takeover.previousChampion && <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-white/38">Passed: {takeover.previousChampion}</p>}
          </div>
        </div>
      )}

      {personalAlert && (
        <div className="fixed left-1/2 top-5 z-[90] w-[min(94vw,560px)] -translate-x-1/2 overflow-hidden rounded-3xl border border-red-300/30 bg-black/88 p-5 text-white shadow-2xl shadow-red-500/20 backdrop-blur-2xl">
          <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_0%,rgba(248,113,113,0.24),transparent_38%),radial-gradient(circle_at_100%_30%,rgba(253,224,71,0.14),transparent_34%)]" />
          <div className="relative">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-200/80">Personal Market Alert</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-white">{personalAlert.type === "outbid" ? "You’ve been outbid" : "You lost rank"}</h3>
            <p className="mt-2 text-sm leading-6 text-white/62">{personalAlert.message ?? "Another creator moved ahead. Reclaim your position before the floor shifts again."}</p>
            <div className="mt-4 grid gap-2 text-xs font-bold text-white/55 sm:grid-cols-3">
              {personalAlert.oldRank != null && <span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">Old rank: #{personalAlert.oldRank}</span>}
              {personalAlert.newRank != null && <span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">New rank: #{personalAlert.newRank}</span>}
              {personalAlert.requiredPower != null && <span className="rounded-xl border border-gold-200/20 bg-gold-200/10 px-3 py-2 text-gold-100">Need +{personalAlert.requiredPower} power</span>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={personalAlert.actionUrl ?? (personalAlert.songId ? `/track/${personalAlert.songId}` : "/marketplace")} className="inline-flex min-h-10 items-center justify-center rounded-full bg-white px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-gold-200">Reclaim Position</a>
              <button type="button" onClick={() => setPersonalAlert(null)} className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-5 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/10">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <aside className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] overflow-hidden rounded-3xl border border-white/10 bg-black/75 p-4 text-white shadow-2xl shadow-black/60 backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.20),transparent_34%),radial-gradient(circle_at_90%_30%,rgba(253,224,71,0.16),transparent_28%)]" />
        {flash && <div className="absolute inset-0 animate-pulse bg-gold-200/10" />}
        <div className="relative">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-300 shadow-lg shadow-green-300/60" : "bg-gold-300 shadow-lg shadow-gold-300/50"}`} /><p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">{connected ? "Realtime Live" : "Live Simulation"}</p></div>
            {isPending && <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100">Refreshing</span>}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">{getEventLabel(event.type)} Event</p>
            <h3 className="mt-1 line-clamp-1 text-lg font-black tracking-[-0.04em] text-white">{event.title ?? "Marketplace Movement"}</h3>
            <p className="mt-1 text-sm leading-5 text-white/55">{event.message ?? "The floor is moving. Watch the rankings."}</p>
            {event.power != null && <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-gold-100">+{event.power} power applied</p>}
          </div>
        </div>
      </aside>
    </>
  );
}

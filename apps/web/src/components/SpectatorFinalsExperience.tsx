"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";

type FinalistTrack = {
  id: string;
  title: string;
  artist: string;
  power?: number | null;
  votes?: number | null;
  audioUrl?: string | null;
  coverUrl?: string | null;
};

type FinalsEvent = {
  title?: string;
  status?: "SCHEDULED" | "LIVE" | "ENDED";
  message?: string;
  leaderId?: string;
  crowdEnergy?: number;
  eventType?: "vote" | "boost" | "crowd" | "leader_change" | "finale" | "tip";
};

type ChatMessage = {
  id: string;
  name: string;
  message: string;
  type?: "chat" | "reaction" | "tip";
  amount?: number;
};

interface SpectatorFinalsExperienceProps {
  finalists?: FinalistTrack[];
  eventName?: string;
}

const fallbackFinalists: FinalistTrack[] = [
  { id: "finalist-1", title: "Crown Control", artist: "Finalist One", power: 860, votes: 1280 },
  { id: "finalist-2", title: "Gold Pressure", artist: "Finalist Two", power: 820, votes: 1190 },
  { id: "finalist-3", title: "Diamond Run", artist: "Finalist Three", power: 790, votes: 1020 },
];

const crowdMessages = [
  "Crowd energy is rising.",
  "A finalist just gained momentum.",
  "The finals floor is heating up.",
  "Spectators are pushing the room louder.",
  "A leader change could happen any second.",
];

const defaultChat: ChatMessage[] = [
  { id: "seed-1", name: "EMS", message: "Finals room is live. React, tip, and watch the crown move." },
  { id: "seed-2", name: "Crowd", message: "Crown energy building..." },
];

export default function SpectatorFinalsExperience({ finalists = fallbackFinalists, eventName = "Epic Music Space Finals" }: SpectatorFinalsExperienceProps) {
  const [event, setEvent] = useState<FinalsEvent>({ status: "LIVE", title: eventName, message: crowdMessages[0], crowdEnergy: 62 });
  const [cycle, setCycle] = useState(0);
  const [reaction, setReaction] = useState<"fire" | "crown" | "shock" | "energy" | null>(null);
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>(defaultChat);
  const [chatInput, setChatInput] = useState("");
  const [displayName, setDisplayName] = useState("Spectator");
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const ranked = useMemo(() => {
    return [...finalists].sort((a, b) => Number(b.power ?? 0) + Number(b.votes ?? 0) / 10 - (Number(a.power ?? 0) + Number(a.votes ?? 0) / 10));
  }, [finalists]);

  const leader = ranked[0];
  const crowdEnergy = Math.max(10, Math.min(100, event.crowdEnergy ?? 62));

  function addChatMessage(message: ChatMessage) {
    setChat((current) => [message, ...current].slice(0, 30));
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCycle((value) => value + 1);
      setEvent((current) => ({
        ...current,
        message: crowdMessages[(cycle + 1) % crowdMessages.length],
        crowdEnergy: Math.min(100, Math.max(30, (current.crowdEnergy ?? 62) + (cycle % 2 === 0 ? 7 : -4))),
      }));
    }, 6500);
    return () => window.clearInterval(interval);
  }, [cycle]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(CHANNELS.marketplace)
      .on("broadcast", { event: "finals_event" }, ({ payload }) => {
        const nextEvent = payload as FinalsEvent;
        setEvent((current) => ({ ...current, ...nextEvent }));
        setReaction(nextEvent.eventType === "leader_change" ? "crown" : nextEvent.eventType === "boost" ? "fire" : nextEvent.eventType === "tip" ? "energy" : "energy");
        window.setTimeout(() => setReaction(null), 2200);
      })
      .on("broadcast", { event: "finals_chat" }, ({ payload }) => {
        addChatMessage(payload as ChatMessage);
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  function triggerLocalReaction(nextReaction: "fire" | "crown" | "shock" | "energy") {
    setReaction(nextReaction);
    const nextMessage: ChatMessage = {
      id: `reaction-${Date.now()}`,
      name: displayName || "Spectator",
      message: nextReaction === "fire" ? "🔥 FIRE" : nextReaction === "crown" ? "👑 CROWN SHIFT" : nextReaction === "shock" ? "😱 ROOM SHOCK" : "⚡ ENERGY UP",
      type: "reaction",
    };
    addChatMessage(nextMessage);
    setEvent((current) => ({ ...current, crowdEnergy: Math.min(100, (current.crowdEnergy ?? 62) + 9), message: "The crowd just reacted live." }));
    if (supabase) {
      void supabase.channel(CHANNELS.marketplace).send({ type: "broadcast", event: "finals_chat", payload: nextMessage });
      void supabase.channel(CHANNELS.marketplace).send({ type: "broadcast", event: "finals_event", payload: { eventType: "crowd", crowdEnergy: Math.min(100, crowdEnergy + 9), message: "Crowd reaction surged." } });
    }
    window.setTimeout(() => setReaction(null), 1600);
  }

  async function submitChat(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    const nextMessage: ChatMessage = { id: `chat-${Date.now()}`, name: displayName || "Spectator", message, type: "chat" };
    addChatMessage(nextMessage);
    setChatInput("");
    if (supabase) {
      void supabase.channel(CHANNELS.marketplace).send({ type: "broadcast", event: "finals_chat", payload: nextMessage });
    }
  }

  async function sendTip(track: FinalistTrack, amount: number) {
    const tipMessage: ChatMessage = {
      id: `tip-${Date.now()}`,
      name: displayName || "Spectator",
      message: `tipped $${amount} to ${track.artist}`,
      type: "tip",
      amount,
    };
    addChatMessage(tipMessage);
    setReaction("energy");
    setEvent((current) => ({ ...current, crowdEnergy: Math.min(100, (current.crowdEnergy ?? 62) + amount), message: `${track.artist} just received a live tip.` }));
    if (supabase) {
      void supabase.channel(CHANNELS.marketplace).send({ type: "broadcast", event: "finals_chat", payload: tipMessage });
      void supabase.channel(CHANNELS.marketplace).send({ type: "broadcast", event: "finals_event", payload: { eventType: "tip", message: `${track.artist} just received a live tip.`, crowdEnergy: Math.min(100, crowdEnergy + amount) } });
    }
    window.setTimeout(() => setReaction(null), 1600);

    // Stripe tip checkout hook. Backend route can be added as /api/stripe/tip.
    try {
      const res = await fetch("/api/stripe/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: track.id, amount }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.url) window.location.href = data.url;
      }
    } catch {}
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050507] px-4 py-8 text-white md:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(253,224,71,0.18),transparent_32%),radial-gradient(circle_at_14%_22%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_88%_65%,rgba(168,85,247,0.16),transparent_34%),linear-gradient(180deg,#050507,#08080d_48%,#050507)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.16] [background-image:linear-gradient(to_right,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:86px_86px]" />

      {reaction && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-black/25 backdrop-blur-[1px]">
          <div className="rounded-[2.25rem] border border-gold-200/35 bg-black/70 px-5 py-6 text-center shadow-2xl shadow-gold-500/20 sm:px-10 sm:py-8">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-gold-100/80 sm:tracking-[0.34em]">Crowd Reaction</p>
            <h2 className="mt-3 break-words text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl md:text-6xl lg:text-8xl">
              {reaction === "crown" ? "CROWN SHIFT" : reaction === "fire" ? "BOOST SURGE" : reaction === "shock" ? "ROOM SHOCK" : "ENERGY UP"}
            </h2>
          </div>
        </div>
      )}

      <div className="relative mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(253,224,71,0.20),transparent_34%),radial-gradient(circle_at_85%_16%,rgba(34,211,238,0.18),transparent_30%)]" />
          <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${connected ? "bg-green-300 shadow-lg shadow-green-300/60" : "bg-gold-300 shadow-lg shadow-gold-300/55"}`} />
                <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-100/80">Spectator Mode</p>
                <span className="rounded-full border border-red-300/25 bg-red-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-100">{event.status ?? "LIVE"}</span>
              </div>

              <h1 className="mt-5 max-w-4xl break-words text-3xl font-black leading-[0.94] tracking-[-0.05em] text-white sm:text-4xl md:text-6xl lg:text-8xl">Live finals event stream.</h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/62 md:text-lg">Watch artists fight for the crown in real time. Chat, react, tip, and push the crowd energy while the finals board moves.</p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-black/40 p-5 shadow-2xl shadow-black/45 backdrop-blur-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Current Leader</p>
              <h2 className="mt-2 line-clamp-2 break-words text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl md:line-clamp-1 md:text-4xl">{leader?.title ?? "Leader Pending"}</h2>
              <p className="mt-1 line-clamp-1 text-sm text-white/45">{leader?.artist ?? "Finalist"}</p>
              <div className="mt-5 rounded-2xl border border-gold-200/15 bg-gold-200/10 p-4"><div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/40"><span>Crowd Energy</span><span>{crowdEnergy}%</span></div><progress max={100} value={crowdEnergy} className="ems-progress ems-progress-gold h-2 w-full" aria-label="Crowd energy" /></div>
              <p className="mt-4 text-sm leading-6 text-white/55">{event.message}</p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_390px]">
          <div className="rounded-[2rem] border border-white/10 bg-black/35 p-5 shadow-2xl shadow-black/45 backdrop-blur-2xl">
            <div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.26em] text-gold-100/75">Finalists</p><h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-white">Live battle board</h2></div><span className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/45">{ranked.length} finalists</span></div>
            <div className="grid gap-4 md:grid-cols-3">
              {ranked.map((track, index) => {
                const score = Number(track.power ?? 0) + Number(track.votes ?? 0) / 10;
                return (
                  <article key={track.id} className={`relative overflow-hidden rounded-[1.65rem] border p-4 shadow-2xl transition hover:-translate-y-1 ${index === 0 ? "border-gold-200/45 bg-gold-200/10 shadow-gold-500/15" : "border-white/10 bg-white/[0.045] shadow-black/30"}`}>
                    <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.14),transparent_28%,transparent_72%,rgba(34,211,238,0.08))]" />
                    <div className="relative">
                      <div className="flex items-center justify-between"><span className="text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">#{index + 1}</span><span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/50">{index === 0 ? "Leader" : "Finalist"}</span></div>
                      <div className="relative mt-5 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/50">{track.coverUrl ? <Image src={track.coverUrl} alt="" fill className="object-cover opacity-80" /> : <div className="grid h-full place-items-center text-xs font-black uppercase tracking-[0.18em] text-white/35">Live Screen</div>}</div>
                      <h3 className="mt-4 line-clamp-1 text-xl font-black tracking-[-0.04em] text-white">{track.title}</h3><p className="mt-1 line-clamp-1 text-sm text-white/45">{track.artist}</p>
                      <progress max={100} value={Math.max(8, Math.min(100, score / 12))} className="ems-progress ems-progress-gold mt-4 h-2 w-full" aria-label={`${track.title} power`} />
                      <div className="mt-3 flex justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-white/40"><span>Power</span><span>{score.toFixed(1)}</span></div>
                      <div className="mt-4 grid grid-cols-3 gap-2">{[5, 10, 25].map((amount) => <button key={amount} type="button" onClick={() => sendTip(track, amount)} className="rounded-xl border border-gold-200/20 bg-gold-200/10 px-2 py-2 text-xs font-black text-gold-100 transition hover:bg-gold-200/20">Tip ${amount}</button>)}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 backdrop-blur-2xl"><p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-100/75">Crowd Controls</p><div className="mt-5 grid gap-2"><button onClick={() => triggerLocalReaction("fire")} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-gold-200/10">Fire Reaction</button><button onClick={() => triggerLocalReaction("crown")} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-cyan-200/10">Crown Shift</button><button onClick={() => triggerLocalReaction("shock")} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-red-300/10">Room Shock</button></div></div>
            <div className="rounded-[2rem] border border-white/10 bg-black/35 p-5 shadow-2xl shadow-black/40 backdrop-blur-2xl"><p className="text-xs font-black uppercase tracking-[0.26em] text-white/35">Live Chat</p><div className="mt-4 grid grid-cols-[1fr_1.2fr] gap-2"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25" placeholder="Name" /><form onSubmit={submitChat} className="flex gap-2"><input value={chatInput} onChange={(e) => setChatInput(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25" placeholder="Say something" /><button className="rounded-xl bg-white px-3 py-2 text-xs font-black text-black">Send</button></form></div><div className="mt-4 max-h-[340px] space-y-2 overflow-y-auto pr-1">{chat.map((item) => <div key={item.id} className={`rounded-2xl border p-3 ${item.type === "tip" ? "border-gold-200/25 bg-gold-200/10" : item.type === "reaction" ? "border-cyan-200/20 bg-cyan-200/10" : "border-white/10 bg-white/[0.045]"}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">{item.name}</p>{item.amount && <span className="text-xs font-black text-gold-100">${item.amount}</span>}</div><p className="mt-1 text-sm leading-5 text-white/68">{item.message}</p></div>)}</div></div>
          </aside>
        </section>
      </div>
    </main>
  );
}

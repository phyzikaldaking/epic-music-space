"use client";

import Link from "next/link";
import { useState } from "react";

const seats = [
  { id: "host", name: "Host", role: "Owner", color: "cyan" },
  { id: "producer", name: "Producer", role: "Beat", color: "pink" },
  { id: "engineer", name: "Engineer", role: "Mix", color: "yellow" },
  { id: "artist", name: "Artist", role: "Vocal", color: "purple" },
];

const activity = [
  "Lead Vox armed for Take 03",
  "Producer can edit arrangement",
  "Engineer pinned mix note",
  "Session checkpoint saved",
];

export default function StudioCollabConsolePage() {
  const [roomLocked, setRoomLocked] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#06080c] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.14),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,.12),transparent_30%),linear-gradient(135deg,#06080c,#111827_55%,#06080c)]" />
      <div className="relative mx-auto flex h-full max-w-[1500px] flex-col p-3">
        <header className="flex h-14 items-center gap-3 rounded-2xl border border-white/15 bg-black/55 px-3">
          <Link href="/studio" className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">Studio</Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/60">EMS Live Room</p>
            <h1 className="truncate text-sm font-black uppercase tracking-[0.2em]">Collab Command Console</h1>
          </div>
          <button onClick={() => setRoomLocked((v) => !v)} className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${roomLocked ? "border-red-300/40 bg-red-300/10 text-red-100" : "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"}`}>{roomLocked ? "Locked" : "Open"}</button>
        </header>

        <section className="mt-3 grid min-h-0 flex-1 grid-cols-[1.2fr_.8fr] gap-3 overflow-hidden">
          <div className="grid min-h-0 grid-rows-[1fr_140px] gap-3 overflow-hidden">
            <div className="grid min-h-0 grid-cols-2 gap-3 overflow-hidden rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              {seats.map((seat) => (
                <article key={seat.id} className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black uppercase tracking-wider text-cyan-100">{seat.name}</h2>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{seat.role}</p>
                    </div>
                    <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-100">live</span>
                  </div>
                  <div className="mt-4 grid flex-1 place-items-center rounded-xl border border-white/10 bg-[#070a0d]">
                    <div className="grid h-24 w-24 place-items-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-3xl font-black text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,.25)]">{seat.name[0]}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button className="rounded border border-cyan-300/30 bg-cyan-300/10 py-2 text-[10px] font-black uppercase text-cyan-100">Mic</button>
                    <button className="rounded border border-pink-300/30 bg-pink-300/10 py-2 text-[10px] font-black uppercase text-pink-100">Cam</button>
                    <button className="rounded border border-yellow-300/30 bg-yellow-300/10 py-2 text-[10px] font-black uppercase text-yellow-100">Edit</button>
                  </div>
                </article>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-3 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <button onClick={() => setMicOn((v) => !v)} className="rounded-xl border border-cyan-300/30 bg-black/45 p-3 text-xs font-black uppercase text-cyan-100">{micOn ? "Mute Mic" : "Unmute Mic"}</button>
              <button onClick={() => setCameraOn((v) => !v)} className="rounded-xl border border-pink-300/30 bg-black/45 p-3 text-xs font-black uppercase text-pink-100">{cameraOn ? "Camera On" : "Camera Off"}</button>
              <button onClick={() => setScreenOn((v) => !v)} className="rounded-xl border border-yellow-300/30 bg-black/45 p-3 text-xs font-black uppercase text-yellow-100">{screenOn ? "Stop Share" : "Share Screen"}</button>
              <button className="rounded-xl border border-emerald-300/30 bg-black/45 p-3 text-xs font-black uppercase text-emerald-100">Drop Marker</button>
            </div>
          </div>

          <aside className="grid min-h-0 grid-rows-[1fr_200px] gap-3 overflow-hidden">
            <section className="rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">Session Activity</h2>
              <div className="mt-3 space-y-2">
                {activity.map((item) => <div key={item} className="rounded-xl border border-white/10 bg-black/45 p-3 text-xs text-white/70">{item}</div>)}
              </div>
            </section>
            <section className="rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">Room Controls</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {['Host Lock', 'Edit Lock', 'Record Approval', 'Export Approval'].map((item) => <button key={item} className="rounded-lg border border-white/10 bg-black/45 px-3 py-3 text-left text-[11px] font-black uppercase text-white/60">{item}</button>)}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

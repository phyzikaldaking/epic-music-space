"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Seat = {
  id: string;
  name: string;
  role: string;
  color: string;
  online: boolean;
  mic: boolean;
  cam: boolean;
  edit: boolean;
  speaking: boolean;
};

const initialSeats: Seat[] = [
  { id: "host", name: "Host", role: "Owner", color: "#23f7ff", online: true, mic: true, cam: true, edit: true, speaking: true },
  { id: "producer", name: "Producer", role: "Beat", color: "#ff34d8", online: true, mic: true, cam: true, edit: true, speaking: false },
  { id: "engineer", name: "Engineer", role: "Mix", color: "#f5d94c", online: true, mic: true, cam: false, edit: true, speaking: false },
  { id: "artist", name: "Artist", role: "Vocal", color: "#9b5cff", online: true, mic: false, cam: true, edit: false, speaking: false },
];

export default function StudioCollabConsolePage() {
  const [seats, setSeats] = useState<Seat[]>(initialSeats);
  const [roomLocked, setRoomLocked] = useState(false);
  const [recordApproval, setRecordApproval] = useState(true);
  const [exportApproval, setExportApproval] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [markerCount, setMarkerCount] = useState(3);
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState([
    "Lead Vox armed for Take 03",
    "Producer can edit arrangement",
    "Engineer pinned mix note",
    "Session checkpoint saved",
  ]);

  const liveCount = useMemo(() => seats.filter((seat) => seat.online).length, [seats]);
  const editCount = useMemo(() => seats.filter((seat) => seat.edit).length, [seats]);
  const mutedCount = useMemo(() => seats.filter((seat) => !seat.mic).length, [seats]);

  function patchSeat(id: string, patch: Partial<Seat>, note: string) {
    setSeats((current) => current.map((seat) => seat.id === id ? { ...seat, ...patch } : seat));
    setActivity((items) => [note, ...items].slice(0, 8));
  }

  async function copyInvite() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/studio/collab` : "/studio/collab";
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }

  function dropMarker() {
    setMarkerCount((count) => count + 1);
    setActivity((items) => [`Marker ${markerCount + 1} dropped on the session timeline`, ...items].slice(0, 8));
  }

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
          <span className="rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-xs font-black uppercase text-emerald-100">{liveCount} live</span>
          <button onClick={copyInvite} className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">{copied ? "Copied" : "Invite"}</button>
          <button onClick={() => setRoomLocked((v) => !v)} className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${roomLocked ? "border-red-300/40 bg-red-300/10 text-red-100" : "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"}`}>{roomLocked ? "Locked" : "Open"}</button>
        </header>

        <section className="mt-3 grid min-h-0 flex-1 grid-cols-[1.2fr_.8fr] gap-3 overflow-hidden">
          <div className="grid min-h-0 grid-rows-[1fr_148px] gap-3 overflow-hidden">
            <div className="grid min-h-0 grid-cols-2 gap-3 overflow-hidden rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              {seats.map((seat) => (
                <article key={seat.id} className="flex min-h-0 flex-col rounded-xl border bg-black/50 p-3" style={{ borderColor: seat.speaking ? seat.color : "rgba(255,255,255,.1)", boxShadow: seat.speaking ? `0 0 20px ${seat.color}40` : undefined }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black uppercase tracking-wider" style={{ color: seat.color }}>{seat.name}</h2>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{seat.role}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${seat.online ? "bg-emerald-300/10 text-emerald-100" : "bg-white/10 text-white/40"}`}>{seat.online ? "live" : "away"}</span>
                  </div>
                  <div className="mt-4 grid flex-1 place-items-center rounded-xl border border-white/10 bg-[#070a0d]">
                    {seat.cam ? <div className="grid h-24 w-24 place-items-center rounded-full border text-3xl font-black" style={{ borderColor: seat.color, color: seat.color, boxShadow: `0 0 22px ${seat.color}35` }}>{seat.name[0]}</div> : <div className="rounded border border-white/10 bg-white/[.03] px-4 py-3 text-xs font-black uppercase tracking-widest text-white/35">Camera off</div>}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button onClick={() => patchSeat(seat.id, { mic: !seat.mic }, `${seat.name} ${seat.mic ? "muted" : "unmuted"} mic`)} className={`rounded border py-2 text-[10px] font-black uppercase ${seat.mic ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-white/35"}`}>Mic</button>
                    <button onClick={() => patchSeat(seat.id, { cam: !seat.cam }, `${seat.name} turned camera ${seat.cam ? "off" : "on"}`)} className={`rounded border py-2 text-[10px] font-black uppercase ${seat.cam ? "border-pink-300/30 bg-pink-300/10 text-pink-100" : "border-white/10 text-white/35"}`}>Cam</button>
                    <button onClick={() => patchSeat(seat.id, { edit: !seat.edit }, `${seat.name} edit permission ${seat.edit ? "removed" : "granted"}`)} className={`rounded border py-2 text-[10px] font-black uppercase ${seat.edit ? "border-yellow-300/30 bg-yellow-300/10 text-yellow-100" : "border-white/10 text-white/35"}`}>Edit</button>
                  </div>
                </article>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-3 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <button onClick={() => setSeats((all) => all.map((seat) => ({ ...seat, mic: false })))} className="rounded-xl border border-cyan-300/30 bg-black/45 p-3 text-xs font-black uppercase text-cyan-100">Mute All</button>
              <button onClick={() => setScreenOn((v) => !v)} className="rounded-xl border border-pink-300/30 bg-black/45 p-3 text-xs font-black uppercase text-pink-100">{screenOn ? "Stop Share" : "Share Screen"}</button>
              <button onClick={dropMarker} className="rounded-xl border border-yellow-300/30 bg-black/45 p-3 text-xs font-black uppercase text-yellow-100">Drop Marker</button>
              <button onClick={() => setActivity((items) => ["Session checkpoint saved manually", ...items].slice(0, 8))} className="rounded-xl border border-emerald-300/30 bg-black/45 p-3 text-xs font-black uppercase text-emerald-100">Save Room</button>
            </div>
          </div>

          <aside className="grid min-h-0 grid-rows-[120px_1fr_210px] gap-3 overflow-hidden">
            <section className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <Stat label="Editors" value={editCount} />
              <Stat label="Muted" value={mutedCount} />
              <Stat label="Markers" value={markerCount} />
            </section>
            <section className="overflow-hidden rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">Session Activity</h2>
              <div className="mt-3 space-y-2 overflow-hidden">
                {activity.map((item) => <div key={item} className="rounded-xl border border-white/10 bg-black/45 p-3 text-xs text-white/70">{item}</div>)}
              </div>
            </section>
            <section className="rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">Room Controls</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Toggle label="Host Lock" active={roomLocked} onClick={() => setRoomLocked((v) => !v)} />
                <Toggle label="Record OK" active={recordApproval} onClick={() => setRecordApproval((v) => !v)} />
                <Toggle label="Export OK" active={exportApproval} onClick={() => setExportApproval((v) => !v)} />
                <Toggle label="Screen" active={screenOn} onClick={() => setScreenOn((v) => !v)} />
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-black/45 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p><p className="mt-2 text-2xl font-black text-cyan-100">{value}</p></div>;
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`rounded-lg border px-3 py-3 text-left text-[11px] font-black uppercase ${active ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-black/45 text-white/45"}`}>{label}</button>;
}

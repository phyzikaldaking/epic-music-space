"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Seat = {
  id: string;
  name: string;
  role: string;
  color: string;
  online: boolean;
  mic: boolean;
  cam: boolean;
  permission: "OWNER" | "EDIT" | "COMMENT" | "VIEW";
  speaking: boolean;
};

type EventItem = { id: string; title: string; detail: string; createdAt: string };
type RoomState = {
  roomId: string;
  roomName: string;
  locked: boolean;
  recordApproval: boolean;
  exportApproval: boolean;
  screenShare: boolean;
  markerCount: number;
  liveCount: number;
  editorCount: number;
  mutedCount: number;
  seats: Seat[];
  events: EventItem[];
  backend: string;
  updatedAt: string;
};

const fallback: RoomState = {
  roomId: "ems-main-room",
  roomName: "EMS Main Studio",
  locked: false,
  recordApproval: true,
  exportApproval: true,
  screenShare: false,
  markerCount: 3,
  liveCount: 4,
  editorCount: 3,
  mutedCount: 1,
  backend: "local-fallback",
  updatedAt: new Date().toISOString(),
  seats: [
    { id: "host", name: "Host", role: "Owner", color: "#23f7ff", online: true, mic: true, cam: true, permission: "OWNER", speaking: true },
    { id: "producer", name: "Producer", role: "Beat", color: "#ff34d8", online: true, mic: true, cam: true, permission: "EDIT", speaking: false },
    { id: "engineer", name: "Engineer", role: "Mix", color: "#f5d94c", online: true, mic: true, cam: false, permission: "EDIT", speaking: false },
    { id: "artist", name: "Artist", role: "Vocal", color: "#9b5cff", online: true, mic: false, cam: true, permission: "COMMENT", speaking: false },
  ],
  events: [
    { id: "take", title: "Take armed", detail: "Lead Vox is ready for Take 03.", createdAt: new Date().toISOString() },
    { id: "checkpoint", title: "Session checkpoint", detail: "Collab room is ready.", createdAt: new Date().toISOString() },
  ],
};

async function readRoom() {
  const res = await fetch("/api/studio/collab/room?roomId=ems-main-room", { cache: "no-store" });
  if (!res.ok) throw new Error("Room API failed");
  return (await res.json()) as RoomState;
}

export default function StudioCollabConsolePage() {
  const [state, setState] = useState<RoomState>(fallback);
  const [copied, setCopied] = useState(false);
  const [liveKitReady, setLiveKitReady] = useState<"checking" | "ready" | "missing">("checking");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const next = await readRoom();
        if (active) setState(next);
      } catch {
        if (active) setState(fallback);
      }
    }
    void load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    async function checkToken() {
      try {
        const res = await fetch("/api/studio/collab/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: state.roomId, identity: "console-check", name: "Console Check" }),
        });
        const data = await res.json().catch(() => null) as { ready?: boolean } | null;
        setLiveKitReady(data?.ready ? "ready" : "missing");
      } catch { setLiveKitReady("missing"); }
    }
    void checkToken();
  }, [state.roomId]);

  const seats = state.seats;
  const activity = state.events;
  const liveCount = useMemo(() => state.liveCount, [state.liveCount]);
  const editCount = useMemo(() => state.editorCount, [state.editorCount]);
  const mutedCount = useMemo(() => state.mutedCount, [state.mutedCount]);

  async function updateRoom(patch: Partial<RoomState>, title: string, detail: string) {
    const optimistic = { ...state, ...patch, updatedAt: new Date().toISOString() };
    setState(optimistic);
    try {
      const res = await fetch("/api/studio/collab/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: state.roomId, ...patch, title, detail }),
      });
      if (res.ok) setState(await res.json());
    } catch {}
  }

  async function patchSeat(seat: Seat, patch: Partial<Seat>, note: string) {
    setState((current) => ({
      ...current,
      seats: current.seats.map((item) => item.id === seat.id ? { ...item, ...patch } : item),
      events: [{ id: `local-${Date.now()}`, title: "Seat updated", detail: note, createdAt: new Date().toISOString() }, ...current.events].slice(0, 8),
    }));
    try {
      const res = await fetch("/api/studio/collab/seat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: state.roomId, seatId: seat.id, ...patch }),
      });
      if (res.ok) setState(await res.json());
    } catch {}
  }

  async function copyInvite() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/studio/collab` : "/studio/collab";
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#06080c] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.14),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,.12),transparent_30%),linear-gradient(135deg,#06080c,#111827_55%,#06080c)]" />
      <div className="relative mx-auto flex h-full max-w-[1500px] flex-col p-3">
        <header className="flex h-14 items-center gap-3 rounded-2xl border border-white/15 bg-black/55 px-3">
          <Link href="/studio" className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">Studio</Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/60">EMS Live Room · {state.backend}</p>
            <h1 className="truncate text-sm font-black uppercase tracking-[0.2em]">{state.roomName}</h1>
          </div>
          <span className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${liveKitReady === "ready" ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" : "border-yellow-300/35 bg-yellow-300/10 text-yellow-100"}`}>LiveKit {liveKitReady}</span>
          <span className="rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-xs font-black uppercase text-emerald-100">{liveCount} live</span>
          <button onClick={copyInvite} className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">{copied ? "Copied" : "Invite"}</button>
          <button onClick={() => updateRoom({ locked: !state.locked }, "Room lock changed", `Room ${state.locked ? "opened" : "locked"}`)} className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${state.locked ? "border-red-300/40 bg-red-300/10 text-red-100" : "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"}`}>{state.locked ? "Locked" : "Open"}</button>
        </header>

        <section className="mt-3 grid min-h-0 flex-1 grid-cols-[1.2fr_.8fr] gap-3 overflow-hidden">
          <div className="grid min-h-0 grid-rows-[1fr_148px] gap-3 overflow-hidden">
            <div className="grid min-h-0 grid-cols-2 gap-3 overflow-hidden rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              {seats.map((seat) => (
                <article key={seat.id} className="flex min-h-0 flex-col rounded-xl border bg-black/50 p-3" style={{ borderColor: seat.speaking ? seat.color : "rgba(255,255,255,.1)", boxShadow: seat.speaking ? `0 0 20px ${seat.color}40` : undefined }}>
                  <div className="flex items-center justify-between">
                    <div><h2 className="text-lg font-black uppercase tracking-wider" style={{ color: seat.color }}>{seat.name}</h2><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{seat.role} · {seat.permission}</p></div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${seat.online ? "bg-emerald-300/10 text-emerald-100" : "bg-white/10 text-white/40"}`}>{seat.online ? "live" : "away"}</span>
                  </div>
                  <div className="mt-4 grid flex-1 place-items-center rounded-xl border border-white/10 bg-[#070a0d]">
                    {seat.cam ? <div className="grid h-24 w-24 place-items-center rounded-full border text-3xl font-black" style={{ borderColor: seat.color, color: seat.color, boxShadow: `0 0 22px ${seat.color}35` }}>{seat.name[0]}</div> : <div className="rounded border border-white/10 bg-white/[.03] px-4 py-3 text-xs font-black uppercase tracking-widest text-white/35">Camera off</div>}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button onClick={() => patchSeat(seat, { mic: !seat.mic }, `${seat.name} ${seat.mic ? "muted" : "unmuted"} mic`)} className={`rounded border py-2 text-[10px] font-black uppercase ${seat.mic ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-white/35"}`}>Mic</button>
                    <button onClick={() => patchSeat(seat, { cam: !seat.cam }, `${seat.name} turned camera ${seat.cam ? "off" : "on"}`)} className={`rounded border py-2 text-[10px] font-black uppercase ${seat.cam ? "border-pink-300/30 bg-pink-300/10 text-pink-100" : "border-white/10 text-white/35"}`}>Cam</button>
                    <button onClick={() => patchSeat(seat, { permission: seat.permission === "EDIT" ? "COMMENT" : "EDIT" }, `${seat.name} edit permission changed`)} className={`rounded border py-2 text-[10px] font-black uppercase ${seat.permission === "EDIT" || seat.permission === "OWNER" ? "border-yellow-300/30 bg-yellow-300/10 text-yellow-100" : "border-white/10 text-white/35"}`}>Edit</button>
                  </div>
                </article>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-3 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <button onClick={() => Promise.all(seats.map((seat) => patchSeat(seat, { mic: false }, `${seat.name} muted by host`)))} className="rounded-xl border border-cyan-300/30 bg-black/45 p-3 text-xs font-black uppercase text-cyan-100">Mute All</button>
              <button onClick={() => updateRoom({ screenShare: !state.screenShare }, "Screen share", state.screenShare ? "Screen share stopped" : "Screen share started")} className="rounded-xl border border-pink-300/30 bg-black/45 p-3 text-xs font-black uppercase text-pink-100">{state.screenShare ? "Stop Share" : "Share Screen"}</button>
              <button onClick={() => updateRoom({ markerCount: state.markerCount + 1 }, "Marker dropped", `Marker ${state.markerCount + 1} dropped on the timeline`)} className="rounded-xl border border-yellow-300/30 bg-black/45 p-3 text-xs font-black uppercase text-yellow-100">Drop Marker</button>
              <button onClick={() => updateRoom({}, "Session checkpoint", "Session checkpoint saved manually")} className="rounded-xl border border-emerald-300/30 bg-black/45 p-3 text-xs font-black uppercase text-emerald-100">Save Room</button>
            </div>
          </div>

          <aside className="grid min-h-0 grid-rows-[120px_1fr_210px] gap-3 overflow-hidden">
            <section className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><Stat label="Editors" value={editCount} /><Stat label="Muted" value={mutedCount} /><Stat label="Markers" value={state.markerCount} /></section>
            <section className="overflow-hidden rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><h2 className="text-sm font-black uppercase tracking-[0.2em]">Session Activity</h2><div className="mt-3 space-y-2 overflow-hidden">{activity.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-black/45 p-3 text-xs text-white/70"><b className="text-white/85">{item.title}</b><br />{item.detail}</div>)}</div></section>
            <section className="rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><h2 className="text-sm font-black uppercase tracking-[0.2em]">Room Controls</h2><div className="mt-3 grid grid-cols-2 gap-2"><Toggle label="Host Lock" active={state.locked} onClick={() => updateRoom({ locked: !state.locked }, "Host lock", "Host lock changed")} /><Toggle label="Record OK" active={state.recordApproval} onClick={() => updateRoom({ recordApproval: !state.recordApproval }, "Record approval", "Record approval changed")} /><Toggle label="Export OK" active={state.exportApproval} onClick={() => updateRoom({ exportApproval: !state.exportApproval }, "Export approval", "Export approval changed")} /><Toggle label="Screen" active={state.screenShare} onClick={() => updateRoom({ screenShare: !state.screenShare }, "Screen share", "Screen state changed")} /></div></section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-white/10 bg-black/45 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p><p className="mt-2 text-2xl font-black text-cyan-100">{value}</p></div>; }
function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) { return <button onClick={onClick} className={`rounded-lg border px-3 py-3 text-left text-[11px] font-black uppercase ${active ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-black/45 text-white/45"}`}>{label}</button>; }

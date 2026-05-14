"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Permission = "OWNER" | "EDIT" | "COMMENT" | "VIEW";
type Seat = { id: string; name: string; role: string; color: string; online: boolean; mic: boolean; cam: boolean; permission: Permission; speaking: boolean };
type EventItem = { id: string; title: string; detail: string; createdAt: string };
type RoomState = { roomId: string; roomName: string; locked: boolean; recordApproval: boolean; exportApproval: boolean; screenShare: boolean; markerCount: number; liveCount: number; editorCount: number; mutedCount: number; seats: Seat[]; events: EventItem[]; backend: string; updatedAt: string };
type TokenResponse = { ready: boolean; url?: string; token?: string; error?: string; permission?: Permission; role?: string };
type Notice = { tone: "success" | "warn" | "error"; title: string; body: string };
type LiveKitRoomLike = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  on: (event: unknown, handler: (...args: unknown[]) => void) => LiveKitRoomLike;
  remoteParticipants?: Map<string, unknown>;
  localParticipant?: {
    setMicrophoneEnabled?: (enabled: boolean) => Promise<unknown>;
    setCameraEnabled?: (enabled: boolean) => Promise<unknown>;
    setScreenShareEnabled?: (enabled: boolean) => Promise<unknown>;
    publishData?: (data: Uint8Array, options?: { reliable?: boolean; topic?: string }) => Promise<void> | void;
  };
};

const fallbackSeats: Seat[] = [
  { id: "host", name: "Host", role: "Owner", color: "#23f7ff", online: true, mic: true, cam: true, permission: "OWNER", speaking: true },
  { id: "producer", name: "Producer", role: "Beat", color: "#ff34d8", online: true, mic: true, cam: true, permission: "EDIT", speaking: false },
  { id: "engineer", name: "Engineer", role: "Mix", color: "#f5d94c", online: true, mic: true, cam: false, permission: "EDIT", speaking: false },
  { id: "artist", name: "Artist", role: "Vocal", color: "#9b5cff", online: true, mic: false, cam: true, permission: "COMMENT", speaking: false },
];

function fallbackRoom(roomId: string): RoomState {
  return {
    roomId,
    roomName: "EMS Main Studio",
    locked: false,
    recordApproval: true,
    exportApproval: true,
    screenShare: false,
    markerCount: 3,
    liveCount: 4,
    editorCount: 3,
    mutedCount: 1,
    seats: fallbackSeats,
    events: [{ id: "ready", title: "Room ready", detail: "Collab room is standing by.", createdAt: new Date().toISOString() }],
    backend: "local-fallback",
    updatedAt: new Date().toISOString(),
  };
}

function clientLog(event: string, data: Record<string, unknown> = {}) {
  const scrubbed = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, /invite|token|secret|jwt/i.test(key) ? "[redacted]" : value]));
  console.info("[ems-collab-client]", JSON.stringify({ ts: new Date().toISOString(), event, ...scrubbed }));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function CollabConsoleClient() {
  const searchParams = useSearchParams();
  const activeRoomId = searchParams.get("roomId") ?? "ems-main-room";
  const inviteToken = searchParams.get("invite") ?? undefined;
  const [room, setRoom] = useState<RoomState>(() => fallbackRoom(activeRoomId));
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);
  const [liveStatus, setLiveStatus] = useState("checking");
  const [viewerPermission, setViewerPermission] = useState<Permission>(inviteToken ? "COMMENT" : "OWNER");
  const [viewerRole, setViewerRole] = useState(inviteToken ? "GUEST" : "HOST");
  const [deviceMessage, setDeviceMessage] = useState("Run a device check before recording or sharing.");
  const [participantCount, setParticipantCount] = useState(1);
  const [localMicOn, setLocalMicOn] = useState(false);
  const [localCamOn, setLocalCamOn] = useState(false);
  const [localScreenOn, setLocalScreenOn] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const liveKitRoomRef = useRef<LiveKitRoomLike | null>(null);

  const canHost = viewerPermission === "OWNER" || viewerRole === "HOST";
  const canEdit = canHost || viewerPermission === "EDIT";
  const liveCount = useMemo(() => Math.max(room.liveCount, room.seats.filter((seat) => seat.online).length, participantCount), [room, participantCount]);
  const protectedPayload = useCallback((payload: Record<string, unknown>) => ({ ...payload, roomId: activeRoomId, invite: inviteToken }), [activeRoomId, inviteToken]);
  const localSeat = room.seats[0] ?? fallbackSeats[0];

  const loadRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/studio/collab/room?roomId=${encodeURIComponent(activeRoomId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Room API ${res.status}`);
      setRoom(await res.json());
    } catch (error) {
      const message = errorMessage(error, "Room load failed");
      setRoom(fallbackRoom(activeRoomId));
      setNotice({ tone: "warn", title: "Room fallback active", body: message });
      clientLog("room_load_failed", { roomId: activeRoomId, error: message });
    }
  }, [activeRoomId]);

  useEffect(() => { void loadRoom(); }, [loadRoom]);

  useEffect(() => {
    let active = true;
    async function join() {
      try {
        setLiveStatus("checking");
        const res = await fetch("/api/studio/collab/livekit-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: activeRoomId, invite: inviteToken, identity: `console-${Date.now()}`, name: "EMS Console" }) });
        const data = (await res.json().catch(() => null)) as TokenResponse | null;
        if (!active) return;
        if (!data?.ready || !data.url || !data.token) {
          const body = data?.error ?? "Live room token was not issued.";
          setLiveStatus("missing");
          setNotice({ tone: "warn", title: "Live room not connected", body });
          clientLog("livekit_token_unavailable", { roomId: activeRoomId, status: res.status, error: body });
          return;
        }
        setViewerPermission(data.permission ?? (inviteToken ? "COMMENT" : "OWNER"));
        setViewerRole(data.role ?? (inviteToken ? "GUEST" : "HOST"));
        const livekit = await import("livekit-client");
        if (!active) return;
        const lkRoom = new livekit.Room({ adaptiveStream: true, dynacast: true }) as unknown as LiveKitRoomLike;
        const refreshParticipants = () => setParticipantCount((lkRoom.remoteParticipants?.size ?? 0) + 1);
        lkRoom.on(livekit.RoomEvent.ParticipantConnected, refreshParticipants);
        lkRoom.on(livekit.RoomEvent.ParticipantDisconnected, refreshParticipants);
        lkRoom.on(livekit.RoomEvent.DataReceived, () => void loadRoom());
        await lkRoom.connect(data.url, data.token);
        if (!active) { lkRoom.disconnect(); return; }
        liveKitRoomRef.current = lkRoom;
        refreshParticipants();
        setLiveStatus("connected");
        setNotice({ tone: "success", title: "Live room connected", body: "LiveKit room join, media controls, data sync, and participant presence are active." });
        clientLog("livekit_connected", { roomId: activeRoomId, permission: data.permission, role: data.role });
      } catch (error) {
        const body = errorMessage(error, "LiveKit authorization failed.");
        if (active) { setLiveStatus("error"); setNotice({ tone: "error", title: "LiveKit failed", body }); clientLog("livekit_connection_failed", { roomId: activeRoomId, error: body }); }
      }
    }
    void join();
    return () => { active = false; liveKitRoomRef.current?.disconnect(); liveKitRoomRef.current = null; setParticipantCount(1); setLocalMicOn(false); setLocalCamOn(false); setLocalScreenOn(false); };
  }, [activeRoomId, inviteToken, loadRoom]);

  async function broadcastRoomUpdate(topic: string) {
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ type: "room:update", topic, roomId: activeRoomId, at: new Date().toISOString() }));
      await liveKitRoomRef.current?.localParticipant?.publishData?.(payload, { reliable: true, topic: "ems-room-state" });
    } catch (error) {
      clientLog("livekit_data_broadcast_failed", { roomId: activeRoomId, error: errorMessage(error, "broadcast failed") });
    }
  }

  async function postRoom(patch: Partial<RoomState>, title: string, detail: string) {
    if ((patch.locked !== undefined || patch.recordApproval !== undefined || patch.exportApproval !== undefined) && !canHost) {
      setNotice({ tone: "warn", title: "Host required", body: "Only a host can change room security or approvals." });
      return;
    }
    try {
      const res = await fetch("/api/studio/collab/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(protectedPayload({ ...patch, title, detail })) });
      if (!res.ok) throw new Error(`Room update ${res.status}`);
      setRoom(await res.json());
      await broadcastRoomUpdate(title);
      clientLog("room_update_sent", { roomId: activeRoomId, title });
    } catch (error) {
      setNotice({ tone: "error", title: "Room update failed", body: errorMessage(error, "Room update failed.") });
    }
  }

  async function postSeat(seat: Seat, patch: Partial<Seat>, note: string) {
    if (!canEdit && patch.permission) {
      setNotice({ tone: "warn", title: "Edit required", body: "Only editors or hosts can change participant permissions." });
      return;
    }
    try {
      const res = await fetch("/api/studio/collab/seat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(protectedPayload({ seatId: seat.id, ...patch })) });
      if (!res.ok) throw new Error(`Seat update ${res.status}`);
      setRoom(await res.json());
      await broadcastRoomUpdate(note);
      clientLog("seat_update_sent", { roomId: activeRoomId, seatId: seat.id, note });
    } catch (error) {
      setNotice({ tone: "error", title: "Seat update failed", body: errorMessage(error, "Seat update failed.") });
    }
  }

  async function moderate(seat: Seat, action: string) {
    if (!canHost) {
      setNotice({ tone: "warn", title: "Host required", body: "Only the host can moderate participants." });
      return;
    }
    try {
      const res = await fetch("/api/studio/collab/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(protectedPayload({ seatId: seat.id, action, reason: `Host action: ${action}` })) });
      if (!res.ok) throw new Error(`Moderation ${res.status}`);
      setRoom(await res.json());
      await broadcastRoomUpdate(action);
      clientLog("moderation_sent", { roomId: activeRoomId, seatId: seat.id, action });
    } catch (error) {
      setNotice({ tone: "error", title: "Moderation failed", body: errorMessage(error, "Moderation failed.") });
    }
  }

  async function toggleLocalMic() {
    const next = !localMicOn;
    setMediaBusy(true);
    try {
      const participant = liveKitRoomRef.current?.localParticipant;
      if (!participant?.setMicrophoneEnabled) throw new Error("LiveKit microphone control is unavailable.");
      await participant.setMicrophoneEnabled(next);
      setLocalMicOn(next);
      await postSeat(localSeat, { mic: next }, `local microphone ${next ? "on" : "off"}`);
      clientLog("mic_toggled", { roomId: activeRoomId, enabled: next });
    } catch (error) {
      const body = errorMessage(error, "Microphone permission failed.");
      setNotice({ tone: "error", title: "Microphone failed", body });
      clientLog("mic_toggle_failed", { roomId: activeRoomId, error: body });
    } finally {
      setMediaBusy(false);
    }
  }

  async function toggleLocalCamera() {
    const next = !localCamOn;
    setMediaBusy(true);
    try {
      const participant = liveKitRoomRef.current?.localParticipant;
      if (!participant?.setCameraEnabled) throw new Error("LiveKit camera control is unavailable.");
      await participant.setCameraEnabled(next);
      setLocalCamOn(next);
      await postSeat(localSeat, { cam: next }, `local camera ${next ? "on" : "off"}`);
      clientLog("camera_toggled", { roomId: activeRoomId, enabled: next });
    } catch (error) {
      const body = errorMessage(error, "Camera permission failed.");
      setNotice({ tone: "error", title: "Camera failed", body });
      clientLog("camera_toggle_failed", { roomId: activeRoomId, error: body });
    } finally {
      setMediaBusy(false);
    }
  }

  async function toggleScreenShare() {
    const next = !localScreenOn;
    setMediaBusy(true);
    try {
      const participant = liveKitRoomRef.current?.localParticipant;
      if (!participant?.setScreenShareEnabled) throw new Error("LiveKit screen share control is unavailable.");
      await participant.setScreenShareEnabled(next);
      setLocalScreenOn(next);
      await postRoom({ screenShare: next }, "Screen share", next ? "Screen share started" : "Screen share stopped");
      clientLog("screen_share_toggled", { roomId: activeRoomId, enabled: next });
    } catch (error) {
      const body = errorMessage(error, "Screen share permission failed.");
      setNotice({ tone: "error", title: "Screen share failed", body });
      clientLog("screen_share_failed", { roomId: activeRoomId, error: body });
    } finally {
      setMediaBusy(false);
    }
  }

  async function runDeviceCheck() {
    try {
      setDeviceMessage("Checking browser device access...");
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mic = devices.some((device) => device.kind === "audioinput");
      const cam = devices.some((device) => device.kind === "videoinput");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: cam });
      stream.getTracks().forEach((track) => track.stop());
      setDeviceMessage(`Device check passed. Mic: ${mic ? "yes" : "no"}. Camera: ${cam ? "yes" : "no"}.`);
    } catch (error) {
      setDeviceMessage(errorMessage(error, "Device check failed."));
    }
  }

  async function copyInvite() {
    const url = `${window.location.origin}/studio/collab?roomId=${encodeURIComponent(activeRoomId)}${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const noticeClass = notice?.tone === "error" ? "border-red-300/30 bg-red-300/10 text-red-100" : notice?.tone === "success" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-yellow-300/30 bg-yellow-300/10 text-yellow-100";

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#06080c] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.14),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,.12),transparent_30%),linear-gradient(135deg,#06080c,#111827_55%,#06080c)]" />
      <div className="relative mx-auto flex h-full max-w-[1500px] flex-col gap-3 p-3">
        <header className="flex h-14 items-center gap-3 rounded-2xl border border-white/15 bg-black/55 px-3">
          <Link href="/studio" className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">Studio</Link>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/60">{room.backend} · {activeRoomId}</p><h1 className="truncate text-sm font-black uppercase tracking-[0.2em]">{room.roomName}</h1></div>
          <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-black uppercase text-white/70">{viewerRole} · {viewerPermission}</span>
          <span className="rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-xs font-black uppercase text-emerald-100">{liveStatus}</span>
          <span className="rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-xs font-black uppercase text-emerald-100">{liveCount} live</span>
          <button onClick={copyInvite} className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">{copied ? "Copied" : "Invite"}</button>
          <button disabled={!canHost} onClick={() => postRoom({ locked: !room.locked }, "Room lock changed", `Room ${room.locked ? "opened" : "locked"}`)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-black uppercase text-white/70 disabled:opacity-30">{room.locked ? "Locked" : "Open"}</button>
        </header>
        {notice && <div className={`rounded-xl border px-3 py-2 text-xs ${noticeClass}`}><b>{notice.title}:</b> {notice.body}</div>}
        <section className="grid min-h-0 flex-1 grid-cols-[1.2fr_.8fr] gap-3 overflow-hidden">
          <div className="grid min-h-0 grid-rows-[1fr_96px] gap-3 overflow-hidden">
            <div className="grid min-h-0 grid-cols-2 gap-3 overflow-hidden rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              {room.seats.map((seat) => <article key={seat.id} className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/50 p-3">
                <div className="flex items-center justify-between"><div><h2 className="text-lg font-black uppercase" style={{ color: seat.color }}>{seat.name}</h2><p className="text-[10px] font-black uppercase tracking-widest text-white/40">{seat.role} · {seat.permission}</p></div><span className="text-[10px] uppercase text-white/50">{seat.online ? "live" : "away"}</span></div>
                <div className="mt-4 grid flex-1 place-items-center rounded-xl border border-white/10 bg-[#070a0d]"><div className="grid h-24 w-24 place-items-center rounded-full border text-3xl font-black" style={{ borderColor: seat.color, color: seat.color }}>{seat.cam ? seat.name[0] : "—"}</div></div>
                <div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => postSeat(seat, { mic: !seat.mic }, "mic toggle")} className="rounded border border-white/10 py-2 text-[10px] uppercase text-white/60">Mic</button><button onClick={() => postSeat(seat, { cam: !seat.cam }, "camera toggle")} className="rounded border border-white/10 py-2 text-[10px] uppercase text-white/60">Cam</button><button disabled={!canEdit} onClick={() => postSeat(seat, { permission: seat.permission === "EDIT" ? "COMMENT" : "EDIT" }, "permission toggle")} className="rounded border border-white/10 py-2 text-[10px] uppercase text-white/60 disabled:opacity-30">Edit</button></div>
                {canHost && <div className="mt-2 grid grid-cols-3 gap-2"><button onClick={() => moderate(seat, "mute")} className="rounded border border-white/10 py-1 text-[9px] uppercase text-white/40">Mute</button><button onClick={() => moderate(seat, "camera_off")} className="rounded border border-white/10 py-1 text-[9px] uppercase text-white/40">Cam Off</button><button onClick={() => moderate(seat, "kick")} className="rounded border border-red-300/25 py-1 text-[9px] uppercase text-red-100/70">Kick</button></div>}
              </article>)}
            </div>
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <button disabled={mediaBusy || liveStatus !== "connected"} onClick={toggleLocalMic} className={`rounded-xl border px-3 py-2 text-xs font-black uppercase disabled:opacity-35 ${localMicOn ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-black/45 text-white/50"}`}>{localMicOn ? "Mic On" : "Mic Off"}</button>
              <button disabled={mediaBusy || liveStatus !== "connected"} onClick={toggleLocalCamera} className={`rounded-xl border px-3 py-2 text-xs font-black uppercase disabled:opacity-35 ${localCamOn ? "border-pink-300/35 bg-pink-300/10 text-pink-100" : "border-white/10 bg-black/45 text-white/50"}`}>{localCamOn ? "Camera On" : "Camera Off"}</button>
              <button disabled={mediaBusy || liveStatus !== "connected"} onClick={toggleScreenShare} className={`rounded-xl border px-3 py-2 text-xs font-black uppercase disabled:opacity-35 ${localScreenOn ? "border-yellow-300/35 bg-yellow-300/10 text-yellow-100" : "border-white/10 bg-black/45 text-white/50"}`}>{localScreenOn ? "Stop Share" : "Share Screen"}</button>
            </div>
          </div>
          <aside className="grid min-h-0 grid-rows-[120px_1fr_210px_160px] gap-3 overflow-hidden">
            <section className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><Stat label="Editors" value={room.editorCount} /><Stat label="Muted" value={room.mutedCount} /><Stat label="Markers" value={room.markerCount} /></section>
            <section className="overflow-hidden rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><h2 className="text-sm font-black uppercase tracking-[0.2em]">Activity</h2><div className="mt-3 space-y-2">{room.events.slice(0, 5).map((event) => <div key={event.id} className="rounded-xl border border-white/10 bg-black/45 p-3 text-xs text-white/70"><b>{event.title}</b><br />{event.detail}</div>)}</div></section>
            <section className="rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><h2 className="text-sm font-black uppercase tracking-[0.2em]">Room Controls</h2><div className="mt-3 grid grid-cols-2 gap-2"><Toggle disabled={!canHost} label="Record OK" active={room.recordApproval} onClick={() => postRoom({ recordApproval: !room.recordApproval }, "Record approval", "Record approval changed")} /><Toggle disabled={!canHost} label="Export OK" active={room.exportApproval} onClick={() => postRoom({ exportApproval: !room.exportApproval }, "Export approval", "Export approval changed")} /><Toggle label="Screen" active={room.screenShare} onClick={toggleScreenShare} /><Toggle label="Marker" active={false} onClick={() => postRoom({ markerCount: room.markerCount + 1 }, "Marker dropped", "Marker dropped")} /></div></section>
            <section className="rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><div className="flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-[0.2em]">Device Check</h2><button onClick={runDeviceCheck} className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">Run</button></div><p className="mt-3 text-xs text-white/55">{deviceMessage}</p></section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-white/10 bg-black/45 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p><p className="mt-2 text-2xl font-black text-cyan-100">{value}</p></div>; }
function Toggle({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) { return <button disabled={disabled} onClick={onClick} className={`rounded-lg border px-3 py-3 text-left text-[11px] font-black uppercase disabled:opacity-35 ${active ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-black/45 text-white/45"}`}>{label}</button>; }

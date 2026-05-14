"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Permission = "OWNER" | "EDIT" | "COMMENT" | "VIEW";
type Seat = {
  id: string;
  name: string;
  role: string;
  color: string;
  online: boolean;
  mic: boolean;
  cam: boolean;
  permission: Permission;
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
type LiveKitTokenResponse = {
  ready: boolean;
  url?: string;
  token?: string;
  roomId?: string;
  identity?: string;
  error?: string;
  permission?: Permission;
  role?: string;
};
type LiveKitRoomLike = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  on: (event: unknown, handler: (...args: unknown[]) => void) => LiveKitRoomLike;
  localParticipant?: {
    publishData?: (data: Uint8Array, options?: { reliable?: boolean; topic?: string }) => Promise<void> | void;
    setMicrophoneEnabled?: (enabled: boolean) => Promise<unknown>;
    setCameraEnabled?: (enabled: boolean) => Promise<unknown>;
    setScreenShareEnabled?: (enabled: boolean) => Promise<unknown>;
  };
  remoteParticipants?: Map<string, unknown>;
};
type Notice = { tone: "info" | "warn" | "error" | "success"; title: string; body: string };
type DevicePreflight = {
  status: "idle" | "checking" | "ready" | "warning" | "blocked";
  mic: boolean;
  camera: boolean;
  speaker: boolean;
  message: string;
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

async function readRoom(roomId: string) {
  const res = await fetch(`/api/studio/collab/room?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Room API failed with ${res.status}`);
  return (await res.json()) as RoomState;
}

function trackClientEvent(event: string, metadata: Record<string, unknown> = {}) {
  const safeMetadata = Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, /token|secret|invite|jwt|key/i.test(key) ? "[redacted]" : value]),
  );
  console.info("[ems-collab-client]", JSON.stringify({ ts: new Date().toISOString(), event, ...safeMetadata }));
}

function messageFromError(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}

export default function StudioCollabConsolePage() {
  const searchParams = useSearchParams();
  const activeRoomId = searchParams.get("roomId") ?? "ems-main-room";
  const inviteToken = searchParams.get("invite") ?? undefined;
  const [state, setState] = useState<RoomState>({ ...fallback, roomId: activeRoomId });
  const [copied, setCopied] = useState(false);
  const [liveKitReady, setLiveKitReady] = useState<"checking" | "missing" | "connected" | "error">("checking");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [participantCount, setParticipantCount] = useState(1);
  const [localMicOn, setLocalMicOn] = useState(false);
  const [localCamOn, setLocalCamOn] = useState(false);
  const [localScreenOn, setLocalScreenOn] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [viewerPermission, setViewerPermission] = useState<Permission>(inviteToken ? "COMMENT" : "OWNER");
  const [viewerRole, setViewerRole] = useState(inviteToken ? "GUEST" : "HOST");
  const [preflight, setPreflight] = useState<DevicePreflight>({ status: "idle", mic: false, camera: false, speaker: false, message: "Run a device check before recording or sharing." });
  const liveKitRoomRef = useRef<LiveKitRoomLike | null>(null);

  const canHost = viewerPermission === "OWNER" || viewerRole === "HOST";
  const canEdit = viewerPermission === "OWNER" || viewerPermission === "EDIT";
  const seats = state.seats;
  const activity = state.events;
  const liveCount = useMemo(() => Math.max(state.liveCount, participantCount), [state.liveCount, participantCount]);
  const editCount = useMemo(() => state.editorCount, [state.editorCount]);
  const mutedCount = useMemo(() => state.mutedCount, [state.mutedCount]);

  const loadRoom = useCallback(async () => {
    try {
      setState(await readRoom(activeRoomId));
    } catch (error) {
      const body = messageFromError(error, "Could not load the collab room.");
      setState({ ...fallback, roomId: activeRoomId });
      setNotice({ tone: "warn", title: "Room fallback active", body });
      trackClientEvent("room_load_failed", { roomId: activeRoomId, error: body });
    }
  }, [activeRoomId]);

  useEffect(() => { void loadRoom(); }, [loadRoom]);

  useEffect(() => {
    let active = true;
    async function joinLiveKit() {
      setLiveKitReady("checking");
      try {
        const tokenRes = await fetch("/api/studio/collab/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: activeRoomId, invite: inviteToken, identity: `console-${Date.now()}`, name: "EMS Console" }),
        });
        const tokenData = (await tokenRes.json().catch(() => null)) as LiveKitTokenResponse | null;
        if (!active) return;
        if (!tokenData?.ready || !tokenData.url || !tokenData.token) {
          const body = tokenData?.error ?? "LiveKit is not configured or the room rejected this session.";
          setLiveKitReady("missing");
          setNotice({ tone: "warn", title: "Live room not connected", body });
          trackClientEvent("livekit_token_unavailable", { roomId: activeRoomId, status: tokenRes.status, error: body });
          return;
        }

        setViewerPermission(tokenData.permission ?? (inviteToken ? "COMMENT" : "OWNER"));
        setViewerRole(tokenData.role ?? (inviteToken ? "GUEST" : "HOST"));
        const livekit = await import("livekit-client");
        if (!active) return;
        const room = new livekit.Room({ adaptiveStream: true, dynacast: true }) as unknown as LiveKitRoomLike;
        const refreshParticipants = () => setParticipantCount((room.remoteParticipants?.size ?? 0) + 1);
        room.on(livekit.RoomEvent.ParticipantConnected, refreshParticipants);
        room.on(livekit.RoomEvent.ParticipantDisconnected, refreshParticipants);
        room.on(livekit.RoomEvent.DataReceived, () => void loadRoom());
        await room.connect(tokenData.url, tokenData.token);
        if (!active) { room.disconnect(); return; }
        liveKitRoomRef.current = room;
        refreshParticipants();
        setLiveKitReady("connected");
        setNotice({ tone: "success", title: "Live room connected", body: "Mic, camera, data sync, and screen sharing are available." });
        trackClientEvent("livekit_connected", { roomId: activeRoomId, permission: tokenData.permission, role: tokenData.role });
      } catch (error) {
        if (!active) return;
        const body = messageFromError(error, "LiveKit connection failed.");
        setLiveKitReady("error");
        setNotice({ tone: "error", title: "LiveKit connection failed", body });
        trackClientEvent("livekit_connection_failed", { roomId: activeRoomId, error: body });
      }
    }
    void joinLiveKit();
    return () => { active = false; liveKitRoomRef.current?.disconnect(); liveKitRoomRef.current = null; };
  }, [activeRoomId, inviteToken, loadRoom]);

  async function runPreflight() {
    setPreflight({ status: "checking", mic: false, camera: false, speaker: false, message: "Checking microphone, camera, and speaker access..." });
    trackClientEvent("preflight_started", { roomId: activeRoomId });
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.();
      const hasMic = Boolean(devices?.some((device) => device.kind === "audioinput"));
      const hasCamera = Boolean(devices?.some((device) => device.kind === "videoinput"));
      const hasSpeaker = Boolean(devices?.some((device) => device.kind === "audiooutput")) || true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: hasCamera });
      stream.getTracks().forEach((track) => track.stop());
      const status = hasMic && hasCamera ? "ready" : "warning";
      const message = status === "ready" ? "Devices are ready for a live studio session." : "Mic works, but camera or output detection may need attention.";
      setPreflight({ status, mic: hasMic, camera: hasCamera, speaker: hasSpeaker, message });
      trackClientEvent("preflight_completed", { roomId: activeRoomId, mic: hasMic, camera: hasCamera, speaker: hasSpeaker, status });
    } catch (error) {
      const body = messageFromError(error, "Browser blocked microphone or camera access.");
      setPreflight({ status: "blocked", mic: false, camera: false, speaker: false, message: body });
      setNotice({ tone: "error", title: "Device check failed", body: "Allow mic/camera permissions in your browser, then run the check again." });
      trackClientEvent("preflight_failed", { roomId: activeRoomId, error: body });
    }
  }

  async function broadcastRoomUpdate(topic: string) {
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ type: "room:update", topic, roomId: activeRoomId, at: new Date().toISOString() }));
      await liveKitRoomRef.current?.localParticipant?.publishData?.(payload, { reliable: true, topic: "ems-room-state" });
    } catch (error) {
      trackClientEvent("data_broadcast_failed", { roomId: activeRoomId, error: messageFromError(error, "broadcast failed") });
    }
  }

  async function updateRoom(patch: Partial<RoomState>, title: string, detail: string) {
    if ((title.includes("lock") || title.includes("approval")) && !canHost) {
      setNotice({ tone: "warn", title: "Host control required", body: "Only a host can change room lock, record approval, or export approval." });
      return;
    }
    setState({ ...state, ...patch, updatedAt: new Date().toISOString() });
    try {
      const res = await fetch("/api/studio/collab/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: activeRoomId, ...patch, title, detail }) });
      if (!res.ok) throw new Error(`Room update failed with ${res.status}`);
      setState(await res.json());
      await broadcastRoomUpdate(title);
      trackClientEvent("room_update_sent", { roomId: activeRoomId, title });
    } catch (error) {
      const body = messageFromError(error, "Room update failed.");
      setNotice({ tone: "error", title: "Room update failed", body });
      trackClientEvent("room_update_failed", { roomId: activeRoomId, error: body });
    }
  }

  async function patchSeat(seat: Seat, patch: Partial<Seat>, note: string) {
    if (!canEdit && Object.prototype.hasOwnProperty.call(patch, "permission")) {
      setNotice({ tone: "warn", title: "Edit permission required", body: "Only editors or hosts can change participant permissions." });
      return;
    }
    setState((current) => ({ ...current, seats: current.seats.map((item) => item.id === seat.id ? { ...item, ...patch } : item), events: [{ id: `local-${Date.now()}`, title: "Seat updated", detail: note, createdAt: new Date().toISOString() }, ...current.events].slice(0, 8) }));
    try {
      const res = await fetch("/api/studio/collab/seat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: activeRoomId, seatId: seat.id, ...patch }) });
      if (!res.ok) throw new Error(`Seat update failed with ${res.status}`);
      setState(await res.json());
      await broadcastRoomUpdate(note);
    } catch (error) {
      const body = messageFromError(error, "Seat update failed.");
      setNotice({ tone: "error", title: "Seat update failed", body });
      trackClientEvent("seat_update_failed", { roomId: activeRoomId, seatId: seat.id, error: body });
    }
  }

  async function moderateSeat(seat: Seat, action: string, reason: string) {
    if (!canHost) {
      setNotice({ tone: "warn", title: "Host control required", body: "Only the host can mute, remove, or restrict participants." });
      return;
    }
    try {
      const res = await fetch("/api/studio/collab/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: activeRoomId, seatId: seat.id, action, reason }) });
      if (!res.ok) throw new Error(`Moderation failed with ${res.status}`);
      setState(await res.json());
      await broadcastRoomUpdate(action);
      trackClientEvent("moderation_sent", { roomId: activeRoomId, seatId: seat.id, action });
    } catch (error) {
      const body = messageFromError(error, "Moderation action failed.");
      setNotice({ tone: "error", title: "Moderation failed", body });
      trackClientEvent("moderation_failed", { roomId: activeRoomId, seatId: seat.id, action, error: body });
    }
  }

  async function toggleLocalMic() {
    const next = !localMicOn;
    setMediaBusy(true);
    try {
      if (!liveKitRoomRef.current?.localParticipant?.setMicrophoneEnabled) throw new Error("LiveKit microphone control is unavailable.");
      await liveKitRoomRef.current.localParticipant.setMicrophoneEnabled(next);
      setLocalMicOn(next);
      await patchSeat(seats[0] ?? fallback.seats[0], { mic: next }, `Local microphone ${next ? "enabled" : "disabled"}`);
      trackClientEvent("mic_toggled", { roomId: activeRoomId, enabled: next });
    } catch (error) {
      const body = messageFromError(error, "Microphone permission failed.");
      setNotice({ tone: "error", title: "Microphone failed", body });
      trackClientEvent("mic_toggle_failed", { roomId: activeRoomId, error: body });
    } finally { setMediaBusy(false); }
  }

  async function toggleLocalCamera() {
    const next = !localCamOn;
    setMediaBusy(true);
    try {
      if (!liveKitRoomRef.current?.localParticipant?.setCameraEnabled) throw new Error("LiveKit camera control is unavailable.");
      await liveKitRoomRef.current.localParticipant.setCameraEnabled(next);
      setLocalCamOn(next);
      await patchSeat(seats[0] ?? fallback.seats[0], { cam: next }, `Local camera ${next ? "enabled" : "disabled"}`);
      trackClientEvent("camera_toggled", { roomId: activeRoomId, enabled: next });
    } catch (error) {
      const body = messageFromError(error, "Camera permission failed.");
      setNotice({ tone: "error", title: "Camera failed", body });
      trackClientEvent("camera_toggle_failed", { roomId: activeRoomId, error: body });
    } finally { setMediaBusy(false); }
  }

  async function toggleScreenShare() {
    const next = !localScreenOn;
    setMediaBusy(true);
    try {
      if (!liveKitRoomRef.current?.localParticipant?.setScreenShareEnabled) throw new Error("LiveKit screen share control is unavailable.");
      await liveKitRoomRef.current.localParticipant.setScreenShareEnabled(next);
      setLocalScreenOn(next);
      await updateRoom({ screenShare: next }, "Screen share", next ? "Screen share started" : "Screen share stopped");
      trackClientEvent("screen_share_toggled", { roomId: activeRoomId, enabled: next });
    } catch (error) {
      const body = messageFromError(error, "Screen share permission failed.");
      setNotice({ tone: "error", title: "Screen share failed", body });
      trackClientEvent("screen_share_failed", { roomId: activeRoomId, error: body });
    } finally { setMediaBusy(false); }
  }

  async function copyInvite() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/studio/collab?roomId=${encodeURIComponent(activeRoomId)}${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""}` : `/studio/collab?roomId=${activeRoomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setNotice({ tone: "warn", title: "Copy failed", body: "Browser clipboard access is blocked. Copy the URL from the address bar." });
    }
  }

  const noticeTone = notice?.tone === "error" ? "border-red-300/35 bg-red-300/10 text-red-100" : notice?.tone === "success" ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" : "border-yellow-300/35 bg-yellow-300/10 text-yellow-100";

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#06080c] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.14),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,.12),transparent_30%),linear-gradient(135deg,#06080c,#111827_55%,#06080c)]" />
      <div className="relative mx-auto flex h-full max-w-[1500px] flex-col p-3">
        <header className="flex h-14 items-center gap-3 rounded-2xl border border-white/15 bg-black/55 px-3">
          <Link href="/studio" className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">Studio</Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/60">EMS Live Room · {state.backend} · {activeRoomId}</p>
            <h1 className="truncate text-sm font-black uppercase tracking-[0.2em]">{state.roomName}</h1>
          </div>
          <span className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${liveKitReady === "connected" ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" : "border-yellow-300/35 bg-yellow-300/10 text-yellow-100"}`}>LiveKit {liveKitReady}</span>
          <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-black uppercase text-white/70">{viewerRole} · {viewerPermission}</span>
          <span className="rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-xs font-black uppercase text-emerald-100">{liveCount} live</span>
          <button onClick={copyInvite} className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">{copied ? "Copied" : "Invite"}</button>
          <button disabled={!canHost} onClick={() => updateRoom({ locked: !state.locked }, "Room lock changed", `Room ${state.locked ? "opened" : "locked"}`)} className={`rounded-lg border px-3 py-2 text-xs font-black uppercase disabled:cursor-not-allowed disabled:opacity-40 ${state.locked ? "border-red-300/40 bg-red-300/10 text-red-100" : "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"}`}>{state.locked ? "Locked" : "Open"}</button>
        </header>

        {notice && <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${noticeTone}`}><b>{notice.title}:</b> {notice.body}</div>}

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
                    <button disabled={!canEdit} onClick={() => patchSeat(seat, { permission: seat.permission === "EDIT" ? "COMMENT" : "EDIT" }, `${seat.name} edit permission changed`)} className={`rounded border py-2 text-[10px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-35 ${seat.permission === "EDIT" || seat.permission === "OWNER" ? "border-yellow-300/30 bg-yellow-300/10 text-yellow-100" : "border-white/10 text-white/35"}`}>Edit</button>
                  </div>
                  {canHost && <div className="mt-2 grid grid-cols-3 gap-2"><button onClick={() => moderateSeat(seat, "mute", "Host muted participant")} className="rounded border border-white/10 py-1 text-[9px] uppercase text-white/40">Mute</button><button onClick={() => moderateSeat(seat, "camera_off", "Host disabled camera")} className="rounded border border-white/10 py-1 text-[9px] uppercase text-white/40">Cam Off</button><button onClick={() => moderateSeat(seat, "kick", "Host removed participant")} className="rounded border border-red-300/25 py-1 text-[9px] uppercase text-red-100/70">Kick</button></div>}
                </article>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-3 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3">
              <button disabled={mediaBusy} onClick={toggleLocalMic} className={`rounded-xl border p-3 text-xs font-black uppercase disabled:opacity-40 ${localMicOn ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-black/45 text-white/50"}`}>{localMicOn ? "Mic On" : "Mic Off"}</button>
              <button disabled={mediaBusy} onClick={toggleLocalCamera} className={`rounded-xl border p-3 text-xs font-black uppercase disabled:opacity-40 ${localCamOn ? "border-pink-300/30 bg-pink-300/10 text-pink-100" : "border-white/10 bg-black/45 text-white/50"}`}>{localCamOn ? "Camera On" : "Camera Off"}</button>
              <button disabled={mediaBusy} onClick={toggleScreenShare} className={`rounded-xl border p-3 text-xs font-black uppercase disabled:opacity-40 ${localScreenOn ? "border-yellow-300/30 bg-yellow-300/10 text-yellow-100" : "border-white/10 bg-black/45 text-white/50"}`}>{localScreenOn ? "Stop Share" : "Share Screen"}</button>
              <button onClick={() => updateRoom({ markerCount: state.markerCount + 1 }, "Marker dropped", `Marker ${state.markerCount + 1} dropped on the timeline`)} className="rounded-xl border border-emerald-300/30 bg-black/45 p-3 text-xs font-black uppercase text-emerald-100">Drop Marker</button>
            </div>
          </div>
          <aside className="grid min-h-0 grid-rows-[120px_1fr_210px_160px] gap-3 overflow-hidden">
            <section className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><Stat label="Editors" value={editCount} /><Stat label="Muted" value={mutedCount} /><Stat label="Markers" value={state.markerCount} /></section>
            <section className="overflow-hidden rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><h2 className="text-sm font-black uppercase tracking-[0.2em]">Session Activity</h2><div className="mt-3 space-y-2 overflow-hidden">{activity.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-black/45 p-3 text-xs text-white/70"><b className="text-white/85">{item.title}</b><br />{item.detail}</div>)}</div></section>
            <section className="rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><h2 className="text-sm font-black uppercase tracking-[0.2em]">Room Controls</h2><div className="mt-3 grid grid-cols-2 gap-2"><Toggle disabled={!canHost} label="Host Lock" active={state.locked} onClick={() => updateRoom({ locked: !state.locked }, "Host lock", "Host lock changed")} /><Toggle disabled={!canHost} label="Record OK" active={state.recordApproval} onClick={() => updateRoom({ recordApproval: !state.recordApproval }, "Record approval", "Record approval changed")} /><Toggle disabled={!canHost} label="Export OK" active={state.exportApproval} onClick={() => updateRoom({ exportApproval: !state.exportApproval }, "Export approval", "Export approval changed")} /><Toggle label="Save Room" active={false} onClick={() => updateRoom({}, "Session checkpoint", "Session checkpoint saved manually")} /></div></section>
            <section className="rounded-2xl border border-white/15 bg-[#10151a]/95 p-3"><div className="flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-[0.2em]">Device Check</h2><button onClick={runPreflight} className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">Run</button></div><p className="mt-2 text-xs text-white/55">{preflight.message}</p><div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-black uppercase"><Badge label="Mic" ok={preflight.mic} /><Badge label="Cam" ok={preflight.camera} /><Badge label="Audio" ok={preflight.speaker} /></div></section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-white/10 bg-black/45 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p><p className="mt-2 text-2xl font-black text-cyan-100">{value}</p></div>; }
function Toggle({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) { return <button disabled={disabled} onClick={onClick} className={`rounded-lg border px-3 py-3 text-left text-[11px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-black/45 text-white/45"}`}>{label}</button>; }
function Badge({ label, ok }: { label: string; ok: boolean }) { return <span className={`rounded border px-2 py-2 text-center ${ok ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/35 text-white/35"}`}>{label}</span>; }

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type StudioSubscriptionTier = "starter" | "pro" | "prime" | "label" | "enterprise";

export interface StudioVideoParticipant {
  id: string;
  name: string;
  role?: "owner" | "producer" | "artist" | "engineer" | "guest";
  cameraEnabled: boolean;
  micEnabled: boolean;
  isLocal?: boolean;
  stream?: MediaStream | null;
}

export const STUDIO_VIDEO_SEAT_LIMITS: Record<StudioSubscriptionTier, number> = {
  starter: 2,
  pro: 4,
  prime: 8,
  label: 16,
  enterprise: 32,
};

interface StudioVideoCollabProps {
  tier?: StudioSubscriptionTier;
  participants?: StudioVideoParticipant[];
  localName?: string;
  onUpgrade?: () => void;
}

export default function StudioVideoCollab({ tier = "starter", participants = [], localName = "You", onUpgrade }: StudioVideoCollabProps) {
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const limit = STUDIO_VIDEO_SEAT_LIMITS[tier];

  const localParticipant: StudioVideoParticipant = useMemo(() => ({
    id: "local",
    name: localName,
    role: "owner",
    cameraEnabled,
    micEnabled,
    isLocal: true,
    stream: localStream,
  }), [cameraEnabled, localName, localStream, micEnabled]);

  const visibleParticipants = useMemo(() => [localParticipant, ...participants].slice(0, limit), [limit, localParticipant, participants]);
  const overflowCount = Math.max(0, participants.length + 1 - limit);

  const stopLocalStream = useCallback(() => {
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
  }, [localStream]);

  async function toggleCamera() {
    setPermissionError(null);
    if (cameraEnabled) {
      stopLocalStream();
      setCameraEnabled(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: micEnabled });
      setLocalStream(stream);
      setCameraEnabled(true);
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : "Camera permission was denied.");
      setCameraEnabled(false);
    }
  }

  async function toggleMic() {
    setPermissionError(null);
    const nextMic = !micEnabled;
    setMicEnabled(nextMic);
    if (!cameraEnabled && nextMic) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        setLocalStream(stream);
      } catch (error) {
        setPermissionError(error instanceof Error ? error.message : "Microphone permission was denied.");
        setMicEnabled(false);
      }
    }
    if (localStream) localStream.getAudioTracks().forEach((track) => { track.enabled = nextMic; });
  }

  useEffect(() => () => stopLocalStream(), [stopLocalStream]);

  return (
    <section className="rounded-2xl border border-cyan-300/20 bg-black/40 p-4 text-white shadow-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/70">Studio Video Room</p>
          <h3 className="text-lg font-bold">See who you&apos;re collabing with</h3>
          <p className="text-xs text-white/50">{visibleParticipants.length}/{limit} seats on {tier.toUpperCase()} plan</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleCamera} className={`min-h-9 rounded-full px-3 text-xs font-black uppercase tracking-widest transition ${cameraEnabled ? "bg-cyan-400 text-black" : "border border-white/15 text-white/70 hover:bg-white/10"}`}>{cameraEnabled ? "Camera On" : "Camera Off"}</button>
          <button type="button" onClick={toggleMic} className={`min-h-9 rounded-full px-3 text-xs font-black uppercase tracking-widest transition ${micEnabled ? "bg-amber-300 text-black" : "border border-white/15 text-white/70 hover:bg-white/10"}`}>{micEnabled ? "Mic On" : "Mic Off"}</button>
        </div>
      </div>

      {permissionError ? <p className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">{permissionError}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visibleParticipants.map((participant) => <ParticipantTile key={participant.id} participant={participant} />)}
        {overflowCount > 0 ? <button type="button" onClick={onUpgrade} className="min-h-32 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-left text-sm text-amber-100 hover:bg-amber-400/15"><span className="block text-lg font-black">+{overflowCount} waiting</span><span className="mt-1 block text-xs text-amber-100/70">Upgrade the studio plan to add more live video collaborators.</span></button> : null}
      </div>
    </section>
  );
}

function ParticipantTile({ participant }: { participant: StudioVideoParticipant }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => { if (videoRef.current && participant.stream) videoRef.current.srcObject = participant.stream; }, [participant.stream]);
  return (
    <article className="relative min-h-32 overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
      {participant.cameraEnabled && participant.stream ? <video ref={videoRef} autoPlay playsInline muted={participant.isLocal} className="absolute inset-0 h-full w-full object-cover"><track kind="captions" /></video> : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10"><div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10 text-lg font-black">{participant.name.slice(0, 2).toUpperCase()}</div></div>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
        <p className="truncate text-sm font-bold">{participant.name}{participant.isLocal ? " · You" : ""}</p>
        <p className="text-[10px] uppercase tracking-widest text-white/55">{participant.role ?? "collab"} · {participant.micEnabled ? "mic on" : "muted"}</p>
      </div>
    </article>
  );
}

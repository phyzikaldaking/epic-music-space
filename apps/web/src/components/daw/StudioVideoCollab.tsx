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

function hasMediaDevices(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function StudioVideoCollab({ tier = "starter", participants = [], localName = "You", onUpgrade }: StudioVideoCollabProps) {
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const limit = STUDIO_VIDEO_SEAT_LIMITS[tier] ?? STUDIO_VIDEO_SEAT_LIMITS.starter;

  const localParticipant: StudioVideoParticipant = useMemo(() => ({
    id: "local",
    name: localName.trim() || "You",
    role: "owner",
    cameraEnabled,
    micEnabled,
    isLocal: true,
    stream: localStream,
  }), [cameraEnabled, localName, localStream, micEnabled]);

  const safeParticipants = useMemo(() => participants.filter((participant) => participant.id !== "local"), [participants]);
  const visibleParticipants = useMemo(() => [localParticipant, ...safeParticipants].slice(0, limit), [limit, localParticipant, safeParticipants]);
  const overflowCount = Math.max(0, safeParticipants.length + 1 - limit);

  const replaceLocalStream = useCallback((nextStream: MediaStream | null) => {
    stopStream(streamRef.current);
    streamRef.current = nextStream;
    setLocalStream(nextStream);
  }, []);

  const stopLocalStream = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setLocalStream(null);
  }, []);

  async function requestLocalStream(nextCamera: boolean, nextMic: boolean): Promise<MediaStream | null> {
    if (!nextCamera && !nextMic) return null;
    if (!hasMediaDevices()) throw new Error("Camera and microphone are not available in this browser or context.");
    return navigator.mediaDevices.getUserMedia({ video: nextCamera, audio: nextMic });
  }

  async function setMediaState(nextCamera: boolean, nextMic: boolean) {
    setPermissionError(null);
    setIsRequesting(true);
    try {
      const stream = await requestLocalStream(nextCamera, nextMic);
      replaceLocalStream(stream);
      setCameraEnabled(nextCamera);
      setMicEnabled(nextMic);
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : "Camera or microphone permission was denied.");
      if (!localStream) {
        setCameraEnabled(false);
        setMicEnabled(false);
      }
    } finally {
      setIsRequesting(false);
    }
  }

  async function toggleCamera() {
    await setMediaState(!cameraEnabled, micEnabled);
  }

  async function toggleMic() {
    await setMediaState(cameraEnabled, !micEnabled);
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={isRequesting} onClick={toggleCamera} className={`min-h-10 touch-manipulation rounded-full px-3 text-xs font-black uppercase tracking-widest transition disabled:cursor-wait disabled:opacity-60 ${cameraEnabled ? "bg-cyan-400 text-black" : "border border-white/15 text-white/70 hover:bg-white/10"}`} aria-pressed={cameraEnabled}>{isRequesting ? "Working" : cameraEnabled ? "Camera On" : "Camera Off"}</button>
          <button type="button" disabled={isRequesting} onClick={toggleMic} className={`min-h-10 touch-manipulation rounded-full px-3 text-xs font-black uppercase tracking-widest transition disabled:cursor-wait disabled:opacity-60 ${micEnabled ? "bg-amber-300 text-black" : "border border-white/15 text-white/70 hover:bg-white/10"}`} aria-pressed={micEnabled}>{isRequesting ? "Working" : micEnabled ? "Mic On" : "Mic Off"}</button>
        </div>
      </div>

      {permissionError ? <p className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100" role="alert">{permissionError}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visibleParticipants.map((participant) => <ParticipantTile key={participant.id} participant={participant} />)}
        {overflowCount > 0 ? <button type="button" onClick={onUpgrade} className="min-h-32 touch-manipulation rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-left text-sm text-amber-100 transition hover:bg-amber-400/15"><span className="block text-lg font-black">+{overflowCount} waiting</span><span className="mt-1 block text-xs text-amber-100/70">Upgrade the studio plan to add more live video collaborators.</span></button> : null}
      </div>
    </section>
  );
}

function ParticipantTile({ participant }: { participant: StudioVideoParticipant }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const initials = (participant.name.trim() || "??").slice(0, 2).toUpperCase();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = participant.stream ?? null;
    return () => { video.srcObject = null; };
  }, [participant.stream]);

  return (
    <article className="relative min-h-32 overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
      {participant.cameraEnabled && participant.stream ? <video ref={videoRef} autoPlay playsInline muted={participant.isLocal} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10"><div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10 text-lg font-black">{initials}</div></div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
        <p className="truncate text-sm font-bold">{participant.name}{participant.isLocal ? " · You" : ""}</p>
        <p className="text-[10px] uppercase tracking-widest text-white/55">{participant.role ?? "collab"} · {participant.micEnabled ? "mic on" : "muted"}</p>
      </div>
    </article>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
  type LocalTrackPublication,
} from "livekit-client";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";
import StudioBackdrop from "@/components/StudioBackdrop";

type Host = {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
};

type Song = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  audioUrl: string;
  licensePrice: string;
  soldLicenses: number;
  totalLicenses: number;
};

type RoomData = {
  id: string;
  title: string;
  description: string | null;
  status: "LIVE" | "ENDED";
  hostId: string;
  host: Host;
  currentSong: Song | null;
};

type Participant = {
  userId: string;
  name: string;
  image: string | null;
  role: "HOST" | "SPEAKER" | "LISTENER";
  handRaised: boolean;
};

type Message = {
  id: string;
  userId: string;
  name: string;
  image: string | null;
  body: string;
  createdAt: string;
};

type ApiMessage = {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  user: { name: string | null; image: string | null };
};

type HostSong = { id: string; title: string; artist: string; coverUrl: string | null; audioUrl: string };

interface Props {
  room: RoomData;
  currentUserId: string;
  liveKitOnline: boolean;
}

export default function RoomClient({ room, currentUserId, liveKitOnline }: Props) {
  const isHost = room.hostId === currentUserId;
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Participant["role"]>(isHost ? "HOST" : "LISTENER");
  const [muted, setMuted] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [ended, setEnded] = useState(room.status === "ENDED");
  const [currentSong, setCurrentSong] = useState<Song | null>(room.currentSong);

  // Synced track playback (host only publishes; others only listen via LiveKit)
  const [trackPlaying, setTrackPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackPublicationRef = useRef<LocalTrackPublication | null>(null);

  // Host UI: change-track picker + recording state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hostSongs, setHostSongs] = useState<HostSong[]>([]);
  const [_recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<"IDLE" | "STARTING" | "RECORDING" | "STOPPING">("IDLE");

  const lkRoomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  async function roomAction(
    path: string,
    init?: RequestInit,
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const res = await fetch(path, init);
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Action failed. Please try again." };
    }
    return { ok: true, data };
  }

  async function broadcast(event: string, payload: Record<string, unknown>) {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    await supabase.channel(CHANNELS.room(room.id)).send({
      type: "broadcast",
      event,
      payload,
    });
  }

  function mapMessage(message: ApiMessage): Message {
    return {
      id: message.id,
      userId: message.userId,
      name: message.user.name ?? "Guest",
      image: message.user.image,
      body: message.body,
      createdAt: message.createdAt,
    };
  }

  // ── Connect to LiveKit ─────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (connecting || connected || ended) return;
    setError(null);
    setConnecting(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/token`, { method: "POST" });
      const data = (await res.json()) as { token?: string; url?: string; role?: Participant["role"]; error?: string };
      if (!res.ok || !data.token || !data.url) {
        throw new Error(data.error ?? "Failed to get token");
      }
      setRole(data.role ?? "LISTENER");

      const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
      lkRoom.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach() as HTMLAudioElement;
          el.style.display = "none";
          document.body.appendChild(el);
          audioElsRef.current.set(participant.identity, el);
        }
      });
      lkRoom.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        track.detach().forEach((el) => el.remove());
        audioElsRef.current.delete(participant.identity);
      });
      lkRoom.on(RoomEvent.Disconnected, () => {
        setConnected(false);
      });

      await lkRoom.connect(data.url, data.token);
      lkRoomRef.current = lkRoom;
      setConnected(true);
      setMuted(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }, [connecting, connected, ended, room.id]);

  const stopTrackPlayback = useCallback(async () => {
    const lkRoom = lkRoomRef.current;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.remove();
      audioRef.current = null;
    }
    if (trackPublicationRef.current && lkRoom) {
      try {
        await lkRoom.localParticipant.unpublishTrack(trackPublicationRef.current.track!);
      } catch {
        // already unpublished
      }
      trackPublicationRef.current = null;
    }
    setTrackPlaying(false);
  }, []);

  const disconnect = useCallback(async (markLeft = true) => {
    await stopTrackPlayback();
    const lkRoom = lkRoomRef.current;
    if (lkRoom) {
      await lkRoom.disconnect();
      lkRoomRef.current = null;
    }
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current.clear();
    setConnected(false);
    setMuted(true);
    if (markLeft && !isHost) {
      await fetch(`/api/rooms/${room.id}/leave`, { method: "POST" }).catch(() => null);
    }
  }, [isHost, room.id, stopTrackPlayback]);

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  // ── Toggle mic ──────────────────────────────────────────────────────
  async function toggleMute() {
    const lkRoom = lkRoomRef.current;
    if (!lkRoom) return;
    const next = !muted;
    setMuted(next);
    try {
      await lkRoom.localParticipant.setMicrophoneEnabled(!next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic toggle failed");
      setMuted(!next);
    }
  }

  // ── Host: synced track playback ─────────────────────────────────────
  // Plays through a hidden <audio>, captures the stream, and publishes the
  // audio track to LiveKit so every listener hears it in sync.
  async function startTrackPlayback() {
    const song = currentSong;
    const lkRoom = lkRoomRef.current;
    if (!song || !lkRoom) return;
    setError(null);

    try {
      const audio = new Audio(song.audioUrl);
      audio.crossOrigin = "anonymous";
      audio.loop = false;
      // Mute element output locally so it doesn't double-up with the
      // subscribed LiveKit playback (we're publishing the captured stream).
      audio.muted = false;
      audioRef.current = audio;

      // Need to await play() before captureStream gets audio frames.
      await audio.play();

      type Captureable = HTMLMediaElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const cap = audio as Captureable;
      const stream = cap.captureStream?.() ?? cap.mozCaptureStream?.();
      if (!stream) throw new Error("captureStream not supported in this browser");

      const [mediaTrack] = stream.getAudioTracks();
      if (!mediaTrack) throw new Error("No audio track to publish");

      const lkTrack = new LocalAudioTrack(mediaTrack);
      const pub = await lkRoom.localParticipant.publishTrack(lkTrack, {
        name: `track:${song.id}`,
        source: Track.Source.Unknown,
      });
      trackPublicationRef.current = pub;
      setTrackPlaying(true);

      audio.addEventListener("ended", () => {
        void stopTrackPlayback();
      });

      // Tell listeners the track started so any UI that wants to react can.
      const supabase = createBrowserSupabaseClient();
      if (supabase) {
        await supabase.channel(CHANNELS.room(room.id)).send({
          type: "broadcast",
          event: "track_started",
          payload: { songId: song.id },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start playback");
      await stopTrackPlayback();
    }
  }

  // ── Hand raising / lowering ─────────────────────────────────────────
  async function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    const result = await roomAction(`/api/rooms/${room.id}/raise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raised: next }),
    });
    if (!result.ok) {
      setHandRaised(!next);
      setError(result.error);
      return;
    }
    await broadcast(next ? "hand_raised" : "hand_lowered", { userId: currentUserId });
  }

  // ── Host: grant / revoke / kick / ban ───────────────────────────────
  async function grantFloor(userId: string) {
    const result = await roomAction(`/api/rooms/${room.id}/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await broadcast("floor_granted", { userId });
  }

  async function revokeFloor(userId: string) {
    const result = await roomAction(`/api/rooms/${room.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await broadcast("floor_revoked", { userId });
  }

  async function kickUser(userId: string) {
    if (!confirm("Kick this listener from the room?")) return;
    const result = await roomAction(`/api/rooms/${room.id}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await broadcast("user_kicked", { userId });
  }

  async function banUser(userId: string) {
    const reason = prompt("Reason for ban (optional):", "");
    if (reason === null) return; // cancelled
    const result = await roomAction(`/api/rooms/${room.id}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, reason }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await broadcast("user_banned", { userId });
  }

  async function endRoom() {
    if (!confirm("End this listening session for everyone?")) return;
    const result = await roomAction(`/api/rooms/${room.id}/end`, { method: "POST" });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnded(true);
    await disconnect();
    await broadcast("room_ended", {});
  }

  // ── Host: change current track ──────────────────────────────────────
  async function openTrackPicker() {
    setPickerOpen(true);
    if (hostSongs.length === 0) {
      const res = await fetch(`/api/rooms/${room.id}/host-songs`);
      if (res.ok) {
        const data = (await res.json()) as { songs: HostSong[] };
        setHostSongs(data.songs);
      }
    }
  }

  async function setCurrent(songId: string | null) {
    setPickerOpen(false);
    await stopTrackPlayback();
    const result = await roomAction(`/api/rooms/${room.id}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const data = result.data as { song: Song | null };
    setCurrentSong(data.song);

    await broadcast("track_changed", { song: data.song });
  }

  // ── Host: recording ─────────────────────────────────────────────────
  async function startRecording() {
    setRecordingStatus("STARTING");
    const res = await fetch(`/api/rooms/${room.id}/record/start`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok) {
      setRecordingStatus("IDLE");
      setError(data.error ?? "Couldn't start recording");
      return;
    }
    setRecordingId(data.id ?? null);
    setRecordingStatus("RECORDING");
  }

  async function stopRecording() {
    setRecordingStatus("STOPPING");
    const result = await roomAction(`/api/rooms/${room.id}/record/stop`, { method: "POST" });
    if (!result.ok) {
      setRecordingStatus("RECORDING");
      setError(result.error);
      return;
    }
    setRecordingId(null);
    setRecordingStatus("IDLE");
  }

  // ── Send chat message ───────────────────────────────────────────────
  async function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const result = await roomAction(`/api/rooms/${room.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { message: apiMessage } = result.data as { message: ApiMessage };
    const message = mapMessage(apiMessage);
    setMessages((prev) => (
      prev.some((existing) => existing.id === message.id) ? prev : [...prev, message]
    ));
    await broadcast("message", { message });
  }

  // ── Bootstrap participants + messages ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const [roomRes, msgRes] = await Promise.all([
        fetch(`/api/rooms/${room.id}`),
        fetch(`/api/rooms/${room.id}/messages`),
      ]);
      if (!cancelled && roomRes.ok) {
        const data = (await roomRes.json()) as {
          room: {
            participants: { userId: string; role: Participant["role"]; handRaised: boolean; user: { id: string; name: string | null; image: string | null } }[];
            status: "LIVE" | "ENDED";
          };
        };
        if (data.room.status === "ENDED") setEnded(true);
        const next = new Map<string, Participant>();
        for (const p of data.room.participants) {
          next.set(p.userId, {
            userId: p.userId,
            role: p.role,
            handRaised: p.handRaised,
            name: p.user.name ?? "Guest",
            image: p.user.image,
          });
        }
        setParticipants(next);
        const me = next.get(currentUserId);
        if (me) {
          setRole(me.role);
          setHandRaised(me.handRaised);
        }
      }
      if (!cancelled && msgRes.ok) {
        const data = (await msgRes.json()) as {
          messages: ApiMessage[];
        };
        setMessages(data.messages.map(mapMessage));
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [room.id, currentUserId]);

  // ── Keep participant list fresh (joins/leaves/role changes) ───────────
  // Broadcasts cover hand raises, chat, and moderation actions, but not
  // plain joins/leaves (and Supabase may be disabled). A light poll keeps
  // the room sidebar accurate without depending on realtime infra.
  useEffect(() => {
    if (ended) return;
    let cancelled = false;
    let inFlight = false;

    async function pollOnce() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/rooms/${room.id}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 403) {
          setError("You no longer have access to this room.");
          setEnded(true);
          void disconnect();
          return;
        }
        if (!res.ok) return;

        const data = (await res.json()) as {
          room: {
            participants: {
              userId: string;
              role: Participant["role"];
              handRaised: boolean;
              user: { id: string; name: string | null; image: string | null };
            }[];
            status: "LIVE" | "ENDED";
          };
        };

        const next = new Map<string, Participant>();
        for (const p of data.room.participants) {
          next.set(p.userId, {
            userId: p.userId,
            role: p.role,
            handRaised: p.handRaised,
            name: p.user.name ?? "Guest",
            image: p.user.image,
          });
        }
        setParticipants(next);

        const me = next.get(currentUserId);
        if (me) {
          setHandRaised(me.handRaised);

          const roleChanged = me.role !== role;
          setRole(me.role);
          if (roleChanged && connected && liveKitOnline) {
            void disconnect(false).then(() => connect());
          }
        }

        if (data.room.status === "ENDED") {
          setEnded(true);
          void disconnect();
        }
      } catch {
        // Ignore transient network errors; next poll will recover.
      } finally {
        inFlight = false;
      }
    }

    void pollOnce();
    const interval = setInterval(pollOnce, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [room.id, currentUserId, ended, role, connected, liveKitOnline, connect, disconnect]);

  // ── Subscribe to broadcasts ─────────────────────────────────────────
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(CHANNELS.room(room.id))
      .on("broadcast", { event: "hand_raised" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setParticipants((prev) => {
          const next = new Map(prev);
          const p = next.get(userId);
          if (p) next.set(userId, { ...p, handRaised: true });
          return next;
        });
        if (userId === currentUserId) setHandRaised(true);
      })
      .on("broadcast", { event: "hand_lowered" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setParticipants((prev) => {
          const next = new Map(prev);
          const p = next.get(userId);
          if (p) next.set(userId, { ...p, handRaised: false });
          return next;
        });
        if (userId === currentUserId) setHandRaised(false);
      })
      .on("broadcast", { event: "floor_granted" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setParticipants((prev) => {
          const next = new Map(prev);
          const p = next.get(userId);
          if (p) next.set(userId, { ...p, role: "SPEAKER", handRaised: false });
          return next;
        });
        if (userId === currentUserId) {
          setRole("SPEAKER");
          void disconnect(false).then(() => connect());
        }
      })
      .on("broadcast", { event: "floor_revoked" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setParticipants((prev) => {
          const next = new Map(prev);
          const p = next.get(userId);
          if (p) next.set(userId, { ...p, role: "LISTENER" });
          return next;
        });
        if (userId === currentUserId) {
          setRole("LISTENER");
          void disconnect(false).then(() => connect());
        }
      })
      .on("broadcast", { event: "user_kicked" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setParticipants((prev) => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
        if (userId === currentUserId) {
          setError("You were removed from this room.");
          void disconnect();
        }
      })
      .on("broadcast", { event: "user_banned" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setParticipants((prev) => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
        if (userId === currentUserId) {
          setError("You were banned from this room.");
          void disconnect();
        }
      })
      .on("broadcast", { event: "track_changed" }, ({ payload }) => {
        const { song } = payload as { song: Song | null };
        setCurrentSong(song);
      })
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const { message } = payload as { message: Message };
        setMessages((prev) => (
          prev.some((existing) => existing.id === message.id) ? prev : [...prev, message]
        ));
      })
      .on("broadcast", { event: "room_ended" }, () => {
        setEnded(true);
        void disconnect();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [room.id, currentUserId, connect, disconnect]);

  // ── Render ──────────────────────────────────────────────────────────
  const speakers = Array.from(participants.values()).filter((p) => p.role !== "LISTENER");
  const handsUp = Array.from(participants.values()).filter((p) => p.handRaised && p.role === "LISTENER");
  const listeners = Array.from(participants.values()).filter((p) => p.role === "LISTENER" && !p.handRaised);

  return (
    <div className="relative min-h-[100dvh]">
      <StudioBackdrop status={ended ? "ENDED" : "LIVE"} />

      <div className="relative mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-200 backdrop-blur-md">
            {ended ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                Session Ended · Live Studio
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                Tracking Room · Live
              </>
            )}
            {recordingStatus === "RECORDING" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                REC
              </span>
            )}
          </div>
          <h1 className="text-3xl font-extrabold">{room.title}</h1>
          <p className="text-sm text-white/50">
            Hosted by{" "}
            {room.host.username ? (
              <Link href={`/studio/${room.host.username}`} className="text-brand-300 hover:underline">
                {room.host.name ?? room.host.username}
              </Link>
            ) : (
              <span>{room.host.name ?? "Host"}</span>
            )}
          </p>
          {room.description && (
            <p className="mt-2 max-w-2xl text-sm text-white/45">{room.description}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          {!connected && !ended && (
            <button
              type="button"
              onClick={connect}
              disabled={connecting || !liveKitOnline}
              className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {connecting ? "Joining..." : "Join Room"}
            </button>
          )}
          {connected && (
            <button
              type="button"
              onClick={() => void disconnect()}
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/8"
            >
              Leave
            </button>
          )}
          {isHost && !ended && (
            <>
              {recordingStatus === "IDLE" && (
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
                >
                  ● Record
                </button>
              )}
              {recordingStatus === "RECORDING" && (
                <button
                  type="button"
                  onClick={() => void stopRecording()}
                  className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-600"
                >
                  ■ Stop
                </button>
              )}
              {(recordingStatus === "STARTING" || recordingStatus === "STOPPING") && (
                <span className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/50">
                  {recordingStatus === "STARTING" ? "Starting..." : "Stopping..."}
                </span>
              )}
              <button
                type="button"
                onClick={endRoom}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
              >
                End Session
              </button>
            </>
          )}
        </div>
      </div>

      {!liveKitOnline && (
        <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
          <span className="font-bold">Live audio infrastructure isn&apos;t configured yet.</span>{" "}
          Set <code className="rounded bg-black/30 px-1">LIVEKIT_API_KEY</code>,{" "}
          <code className="rounded bg-black/30 px-1">LIVEKIT_API_SECRET</code>, and{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_LIVEKIT_URL</code> to enable real-time audio. Chat works.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Stage */}
        <div className="space-y-6">
          {/* Now playing */}
          {currentSong && (
            <div className="flex items-center gap-4 rounded-3xl border border-white/12 bg-[#0a0a0e]/70 p-5 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-brand-900/30">
                {currentSong.coverUrl ? (
                  <Image src={currentSong.coverUrl} alt={currentSong.title} fill sizes="80px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">🎵</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Now playing</p>
                <p className="mt-1 truncate text-lg font-bold">{currentSong.title}</p>
                <p className="truncate text-sm text-white/55">{currentSong.artist}</p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-2">
                <Link
                  href={`/track/${currentSong.id}`}
                  className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600"
                >
                  License · ${currentSong.licensePrice}
                </Link>
                {isHost && connected && (
                  <div className="flex gap-2">
                    {!trackPlaying ? (
                      <button
                        type="button"
                        onClick={() => void startTrackPlayback()}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/15"
                      >
                        ▶ Play to room
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void stopTrackPlayback()}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/15"
                      >
                        ■ Stop
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void openTrackPicker()}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/8"
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {!currentSong && isHost && connected && (
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-dashed border-white/15 bg-white/3 p-5 text-sm text-white/50">
              <span>No track featured. Pick one to feature for your listeners.</span>
              <button
                type="button"
                onClick={() => void openTrackPicker()}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
              >
                Pick a track
              </button>
            </div>
          )}

          {/* Track picker overlay */}
          {pickerOpen && (
            <div className="rounded-3xl border border-white/12 bg-[#0a0a0e]/70 p-5 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Featured Track</h3>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="text-xs text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="grid max-h-72 gap-2 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => void setCurrent(null)}
                  className="rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-left text-sm text-white/55 hover:bg-white/6"
                >
                  Clear featured track
                </button>
                {hostSongs.length === 0 && (
                  <p className="text-xs text-white/30">No tracks uploaded yet.</p>
                )}
                {hostSongs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void setCurrent(s.id)}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-left transition hover:bg-white/6"
                  >
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-white/8">
                      {s.coverUrl ? (
                        <Image src={s.coverUrl} alt={s.title} fill sizes="40px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm">🎵</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{s.title}</p>
                      <p className="truncate text-xs text-white/45">{s.artist}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stage / speakers */}
          <div className="rounded-3xl border border-white/12 bg-[#0a0a0e]/70 p-6 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">On Stage</h2>
              <span className="text-xs text-white/35">
                {listeners.length + handsUp.length} listening
              </span>
            </div>
            <div className="flex flex-wrap gap-4">
              {speakers.length === 0 && (
                <p className="text-sm text-white/30">Waiting for the host...</p>
              )}
              {speakers.map((p) => (
                <div key={p.userId} className="flex flex-col items-center gap-2 text-center">
                  <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-brand-500/50 bg-brand-500/20">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-brand-300">
                        {p.name[0]?.toUpperCase()}
                      </div>
                    )}
                    {p.role === "HOST" && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-gold-500 px-2 py-0.5 text-[9px] font-bold text-black">
                        HOST
                      </span>
                    )}
                  </div>
                  <p className="max-w-[5rem] truncate text-xs font-semibold">{p.name}</p>
                  {isHost && p.role === "SPEAKER" && (
                    <button
                      type="button"
                      onClick={() => void revokeFloor(p.userId)}
                      className="text-[10px] text-white/40 hover:text-red-300"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>

            {connected && (role === "HOST" || role === "SPEAKER") && (
              <div className="mt-6 border-t border-white/8 pt-4">
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                    muted
                      ? "bg-white/8 text-white/70 hover:bg-white/12"
                      : "bg-brand-500 text-white hover:bg-brand-600"
                  }`}
                >
                  {muted ? "🎤 Unmute" : "🔇 Mute"}
                </button>
              </div>
            )}

            {connected && role === "LISTENER" && (
              <div className="mt-6 border-t border-white/8 pt-4">
                <button
                  type="button"
                  onClick={toggleHand}
                  className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                    handRaised
                      ? "bg-amber-400/20 text-amber-200 hover:bg-amber-400/30"
                      : "bg-white/8 text-white/70 hover:bg-white/12"
                  }`}
                >
                  {handRaised ? "✋ Hand raised — waiting" : "✋ Raise hand to speak"}
                </button>
              </div>
            )}
          </div>

          {/* Host: hand-raise queue */}
          {isHost && handsUp.length > 0 && (
            <div className="rounded-3xl border border-amber-400/30 bg-amber-400/5 p-6">
              <h3 className="mb-3 text-sm font-bold text-amber-200">
                ✋ {handsUp.length} {handsUp.length === 1 ? "hand" : "hands"} raised
              </h3>
              <div className="space-y-2">
                {handsUp.map((p) => (
                  <div key={p.userId} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-9 w-9 overflow-hidden rounded-full bg-white/10">
                        {p.image ? (
                          <Image src={p.image} alt={p.name} fill sizes="36px" className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm">{p.name[0]?.toUpperCase()}</div>
                        )}
                      </div>
                      <p className="text-sm font-semibold">{p.name}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void grantFloor(p.userId)}
                        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
                      >
                        Pass mic
                      </button>
                      <button
                        type="button"
                        onClick={() => void kickUser(p.userId)}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:bg-white/8"
                      >
                        Kick
                      </button>
                      <button
                        type="button"
                        onClick={() => void banUser(p.userId)}
                        className="rounded-lg border border-red-500/25 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        Ban
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Host: full listener moderation panel */}
          {isHost && listeners.length > 0 && (
            <div className="rounded-3xl border border-white/12 bg-[#0a0a0e]/70 p-6 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/60">Listeners ({listeners.length})</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {listeners.slice(0, 24).map((p) => (
                  <div key={p.userId} className="flex items-center justify-between gap-3 rounded-xl bg-white/3 p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-white/10">
                        {p.image ? (
                          <Image src={p.image} alt={p.name} fill sizes="28px" className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs">{p.name[0]?.toUpperCase()}</div>
                        )}
                      </div>
                      <p className="truncate text-xs">{p.name}</p>
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => void kickUser(p.userId)}
                        className="rounded-md px-2 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/80"
                      >
                        Kick
                      </button>
                      <button
                        type="button"
                        onClick={() => void banUser(p.userId)}
                        className="rounded-md px-2 py-0.5 text-[10px] text-red-300/70 hover:bg-red-500/10 hover:text-red-300"
                      >
                        Ban
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {listeners.length > 24 && (
                <p className="mt-2 text-xs text-white/30">+ {listeners.length - 24} more</p>
              )}
            </div>
          )}
        </div>

        {/* Chat */}
        <aside className="flex h-[600px] flex-col rounded-3xl border border-white/12 bg-[#0a0a0e]/75 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
          <div className="border-b border-white/8 px-5 py-3">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Live Chat</h3>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 && (
              <p className="text-center text-sm text-white/25">Be the first to say something.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex gap-2">
                <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-white/10">
                  {m.image ? (
                    <Image src={m.image} alt={m.name} fill sizes="28px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-bold">
                      {m.name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white/70">{m.name}</p>
                  <p className="break-words text-sm text-white/85">{m.body}</p>
                </div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex gap-2 border-t border-white/8 p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={ended ? "Session has ended" : "Drop a comment..."}
              maxLength={500}
              disabled={ended}
              className="flex-1 rounded-xl bg-white/5 px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:bg-white/8"
            />
            <button
              type="submit"
              disabled={ended || !draft.trim()}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </aside>
      </div>
      </div>
    </div>
  );
}

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
import RoomReactions from "@/components/RoomReactions";
import ShareRoomButton from "@/components/ShareRoomButton";

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
type SessionMode = "PLAYBACK" | "CRITIQUE" | "A_AND_R" | "SILENT_NOTES";
type StudioVibe = "NEON" | "SUNSET" | "MIDNIGHT";
type NoteCategory = "GENERAL" | "MIX" | "MASTER" | "SONGWRITING" | "ARRANGEMENT" | "PERFORMANCE";

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
  const [connectionQuality, setConnectionQuality] = useState<"good" | "fair" | "poor" | "offline">("offline");
  const [role, setRole] = useState<Participant["role"]>(isHost ? "HOST" : "LISTENER");
  const [muted, setMuted] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
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
  const [sessionMode, setSessionMode] = useState<SessionMode>("PLAYBACK");
  const [studioVibe, setStudioVibe] = useState<StudioVibe>("NEON");
  const [focusUserId, setFocusUserId] = useState<string | null>(null);
  const [energy, setEnergy] = useState(42);
  const [applauseBursts, setApplauseBursts] = useState(0);
  const [heatPoints, setHeatPoints] = useState<number[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [timeNotes, setTimeNotes] = useState<Array<{ id: string; at: string; text: string; author: string }>>([]);
  const [noteCategory, setNoteCategory] = useState<NoteCategory>("GENERAL");
  const [replyToNoteId, setReplyToNoteId] = useState<string | null>(null);
  const [resolvedNoteIds, setResolvedNoteIds] = useState<Set<string>>(new Set());
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [blindAB, setBlindAB] = useState(false);
  const [loudnessMatch, setLoudnessMatch] = useState(true);
  const [abSide, setAbSide] = useState<"A" | "B">("A");
  const [autoQueueEnabled, setAutoQueueEnabled] = useState(false);
  const [quietMode, setQuietMode] = useState(false);
  const [speakerLimitSec, setSpeakerLimitSec] = useState(60);
  const [stemState, setStemState] = useState({
    vocals: true,
    drums: true,
    bass: true,
    melody: true,
  });
  const stateLoadedRef = useRef(false);
  const stateSyncTimerRef = useRef<number | null>(null);

  const lkRoomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pingRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  // Only attempt auto-reconnect after the user has explicitly joined at
  // least once. Prevents the page from auto-joining LiveKit on first
  // mount — which previously fired the mic-permission prompt before the
  // user clicked Join Room and burned the per-user token rate limit.
  const hasJoinedOnce = useRef(false);
  // Cached "did the user/host explicitly leave" flag — auto-reconnect
  // should not fire after a manual disconnect.
  const explicitlyLeft = useRef(false);
  // Modal state for kick / ban / end confirmations (replaces native
  // confirm()/prompt() which render flaky inside the Capacitor WebView).
  const [modal, setModal] = useState<
    | { kind: "kick"; userId: string }
    | { kind: "ban"; userId: string; reason: string }
    | { kind: "end" }
    | null
  >(null);
  // Whether the page is currently visible. Used to pause polling and
  // suppress auto-reconnect attempts when the tab is hidden / WebView
  // is backgrounded.
  const [pageVisible, setPageVisible] = useState(true);
  // True when the active <audio> source is CORS-tainted and captureStream
  // would silently produce no audio frames. Surfaces a banner so the host
  // doesn't think their track is reaching listeners.
  const [trackPublishUnsupported, setTrackPublishUnsupported] = useState(false);

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

  const broadcast = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    await supabase.channel(CHANNELS.room(room.id)).send({
      type: "broadcast",
      event,
      payload,
    });
  }, [room.id]);

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
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        url?: string;
        role?: Participant["role"];
        error?: string;
      };
      if (res.status === 503) {
        throw new Error(
          "Real-time voice isn't switched on for this deployment yet. Chat still works.",
        );
      }
      if (res.status === 401) {
        throw new Error("Sign in to join the room.");
      }
      if (res.status === 403) {
        throw new Error(data.error ?? "You can't join this room.");
      }
      if (res.status === 410 || data.error?.toLowerCase().includes("ended")) {
        throw new Error("This session has ended.");
      }
      if (!res.ok || !data.token || !data.url) {
        throw new Error(
          data.error ?? `Couldn't get a session token (status ${res.status}).`,
        );
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
      // Use LiveKit's native active-speakers event instead of a brittle
      // "playing/pause" hack on the <audio> element (which fires once and
      // never again as long as the track stays subscribed).
      lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeakers(new Set(speakers.map((p) => p.identity)));
      });
      lkRoom.on(RoomEvent.Disconnected, () => {
        setConnected(false);
      });
      lkRoom.on(RoomEvent.Reconnecting, () => {
        setConnectionQuality("poor");
      });
      lkRoom.on(RoomEvent.Reconnected, () => {
        setConnectionQuality("good");
      });
      lkRoom.on(RoomEvent.MediaDevicesError, (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(
          /permission|denied|notallowed/i.test(msg)
            ? "Microphone access was blocked. Click the lock icon in your address bar, allow mic, then try again."
            : "Audio device error. Check your microphone is connected.",
        );
      });
      lkRoom.on(RoomEvent.ConnectionQualityChanged, (quality, p) => {
        // Only react to the local participant's quality — listeners' quality
        // is informational but doesn't drive the host's status indicator.
        if (p?.isLocal === false) return;
        const q =
          quality === "excellent" || quality === "good"
            ? "good"
            : quality === "poor"
              ? "poor"
              : "fair";
        setConnectionQuality(q);
      });

      try {
        await lkRoom.connect(data.url, data.token);
      } catch (connErr) {
        const m = connErr instanceof Error ? connErr.message : String(connErr);
        if (/permission|denied|notallowed/i.test(m)) {
          throw new Error(
            "Microphone access was blocked. Click the lock icon in your address bar, allow mic, then try again.",
          );
        }
        if (/network|websocket|connection/i.test(m)) {
          throw new Error(
            "Couldn't reach the audio server. Check your connection and try again.",
          );
        }
        throw connErr;
      }
      lkRoomRef.current = lkRoom;
      setConnected(true);
      setMuted(true);
      hasJoinedOnce.current = true;
      explicitlyLeft.current = false;
      // reset reconnect attempts and start pinging
      reconnectAttempts.current = 0;
      setConnectionQuality("good");
      startPingLoop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }, [connecting, connected, ended, room.id]);

  // Ping loop to measure RTT and set a simple connection quality indicator
  function startPingLoop() {
    stopPingLoop();
    let cancelled = false;
    async function pingOnce() {
      const t0 = performance.now();
      try {
        const res = await fetch(`/api/rooms/${room.id}/ping`, { cache: "no-store" });
        if (!res.ok) throw new Error("ping failed");
        const rtt = performance.now() - t0;
        if (cancelled) return;
        if (rtt < 150) setConnectionQuality("good");
        else if (rtt < 400) setConnectionQuality("fair");
        else setConnectionQuality("poor");
      } catch {
        if (cancelled) return;
        setConnectionQuality("poor");
      }
    }
    pingOnce();
    const id = window.setInterval(pingOnce, 5000);
    pingRef.current = id;
    return () => {
      cancelled = true;
      if (pingRef.current) window.clearInterval(pingRef.current);
      pingRef.current = null;
    };
  }

  function stopPingLoop() {
    if (pingRef.current) {
      window.clearInterval(pingRef.current);
      pingRef.current = null;
    }
  }

  const stopTrackPlayback = useCallback(async () => {
    const lkRoom = lkRoomRef.current;
    if (audioRef.current) {
      audioRef.current.pause();
      // src="" triggers a synchronous load of an empty URL and throws
      // MEDIA_ELEMENT_ERROR in the console. removeAttribute + load() is
      // the documented teardown.
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
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
    stopPingLoop();
    setConnectionQuality("offline");
    if (markLeft) {
      explicitlyLeft.current = true;
      // Listeners hit /leave to set leftAt. Hosts have nothing to mark
      // here — host departure is handled by the page-unload beacon below
      // (so a tab close ends the room rather than leaving it stale LIVE).
      if (!isHost) {
        await fetch(`/api/rooms/${room.id}/leave`, { method: "POST" }).catch(() => null);
      }
    }
  }, [isHost, room.id, stopTrackPlayback]);

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  // Page unload — fire a sendBeacon so the server hears about the
  // departure even though fetch() is unreliable during pagehide.
  // Hosts: end the room implicitly so it doesn't sit LIVE in the lobby
  // for hours after the host closes the tab.
  useEffect(() => {
    function onUnload() {
      const path = isHost
        ? `/api/rooms/${room.id}/end`
        : `/api/rooms/${room.id}/leave`;
      try {
        navigator.sendBeacon?.(path, new Blob([], { type: "application/json" }));
      } catch {
        /* best-effort */
      }
    }
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [isHost, room.id]);

  // Visibility — pause auto-reconnect / polling while the tab is hidden
  // so a backgrounded WebView on mobile doesn't burn the rate limit.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    setPageVisible(document.visibilityState === "visible");
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // Auto-reconnect on unexpected disconnect with exponential backoff
  useEffect(() => {
    if (connected) {
      reconnectAttempts.current = 0;
      return;
    }
    if (ended) return;
    // Auto-reconnect is opt-in: only fires after the user explicitly
    // clicked "Join Room" once and we successfully connected. Without
    // this guard the page would auto-join on first mount and trigger
    // the browser's mic-permission prompt with no user gesture.
    if (!hasJoinedOnce.current) return;
    if (explicitlyLeft.current) return;
    // Don't burn battery / quota retrying while the tab is hidden.
    if (!pageVisible) return;

    let cancelled = false;
    async function attempt() {
      if (connecting || connected) return;
      const attempts = reconnectAttempts.current ?? 0;
      const delay = Math.min(30_000, Math.pow(2, attempts) * 1000);
      await new Promise((res) => setTimeout(res, delay));
      if (cancelled || connected || explicitlyLeft.current) return;
      reconnectAttempts.current = attempts + 1;
      try {
        await connect();
      } catch {
        // will try again on next effect run
      }
    }
    attempt();
    return () => {
      cancelled = true;
    };
  }, [connected, connecting, connect, ended, pageVisible]);

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
      // Feature-detect captureStream up front. iOS Safari / WKWebView
      // (Capacitor) don't expose it, and using crossOrigin="anonymous"
      // on a non-CORS audioUrl silently mutes the captured stream so
      // listeners hear nothing. Failing fast here surfaces the real
      // limitation instead of producing silent published tracks.
      type Captureable = HTMLMediaElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      if (
        typeof HTMLAudioElement === "undefined" ||
        (!("captureStream" in HTMLAudioElement.prototype) &&
          !("mozCaptureStream" in HTMLAudioElement.prototype))
      ) {
        setTrackPublishUnsupported(true);
        throw new Error(
          "Track-to-room publish isn't supported on this browser. Use the desktop app to play tracks live to listeners.",
        );
      }

      const audio = new Audio(song.audioUrl);
      // Do NOT set crossOrigin — it makes captureStream silent when the
      // audio source isn't CORS-enabled. Same-origin or default-cors
      // sources work without it.
      audio.loop = false;
      // Mute the local element so the host doesn't hear the song twice
      // (once from this <audio>, once from their own LiveKit publish
      // playing back through the subscribed audio elements).
      audio.muted = true;
      audioRef.current = audio;

      // Need to await play() before captureStream gets audio frames.
      await audio.play();

      const cap = audio as Captureable;
      const stream = cap.captureStream?.() ?? cap.mozCaptureStream?.();
      if (!stream) {
        setTrackPublishUnsupported(true);
        throw new Error(
          "Track publish isn't available on this browser. Use the desktop app to stream tracks to the room.",
        );
      }

      const [mediaTrack] = stream.getAudioTracks();
      if (!mediaTrack) throw new Error("No audio track to publish");

      const lkTrack = new LocalAudioTrack(mediaTrack);
      // Source.Unknown so the host's mic publish (Source.Microphone) and
      // this track-stream publish are clearly distinct on the wire — two
      // Microphone tracks per identity would confuse LiveKit routing.
      const pub = await lkRoom.localParticipant.publishTrack(lkTrack, {
        name: `track:${song.id}`,
        source: Track.Source.Unknown,
      });
      trackPublicationRef.current = pub;
      setTrackPlaying(true);
      setTrackPublishUnsupported(false);

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

  // Native confirm()/prompt() render flaky inside the Capacitor WebView
  // and aren't styleable. Open the in-app modal and wait for the user's
  // explicit choice before firing the destructive action.
  function kickUser(userId: string) {
    setModal({ kind: "kick", userId });
  }
  function banUser(userId: string) {
    setModal({ kind: "ban", userId, reason: "" });
  }
  function endRoom() {
    setModal({ kind: "end" });
  }

  async function confirmKick(userId: string) {
    setModal(null);
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

  async function confirmBan(userId: string, reason: string) {
    setModal(null);
    const result = await roomAction(`/api/rooms/${room.id}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, reason: reason.trim() || undefined }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await broadcast("user_banned", { userId });
  }

  async function confirmEnd() {
    setModal(null);
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

  async function sendQuickMessage(body: string) {
    const text = body.trim();
    if (!text) return;
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
    setMessages((prev) => (prev.some((existing) => existing.id === message.id) ? prev : [...prev, message]));
    await broadcast("message", { message });
  }

  async function addTimeNote() {
    const text = noteDraft.trim();
    if (!text) return;
    const stamp = audioRef.current ? audioRef.current.currentTime : 0;
    const mm = Math.floor(stamp / 60)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor(stamp % 60)
      .toString()
      .padStart(2, "0");
    const optimistic = { id: crypto.randomUUID(), at: `${mm}:${ss}`, text, author: isHost ? "Host" : "Listener" };
    setTimeNotes((prev) => [optimistic, ...prev]);
    setNoteDraft("");
    const result = await roomAction(`/api/rooms/${room.id}/timeline-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: text,
        atSeconds: Math.floor(stamp),
        category: noteCategory,
        parentId: replyToNoteId,
      }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { note } = result.data as {
      note: {
        id: string;
        atSeconds: number;
        body: string;
        user: { name: string | null };
      };
    };
    const noteMm = Math.floor(note.atSeconds / 60)
      .toString()
      .padStart(2, "0");
    const noteSs = Math.floor(note.atSeconds % 60)
      .toString()
      .padStart(2, "0");
    const synced = {
      id: note.id,
      at: `${noteMm}:${noteSs}`,
      text: note.body,
      author: note.user.name ?? "Listener",
    };
    setTimeNotes((prev) => [synced, ...prev.filter((n) => n.id !== optimistic.id)].slice(0, 100));
    setReplyToNoteId(null);
    await broadcast("timeline_note_added", { note: synced });
  }

  async function toggleNoteResolved(noteId: string, resolved: boolean) {
    const result = await roomAction(`/api/rooms/${room.id}/timeline-notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResolvedNoteIds((prev) => {
      const next = new Set(prev);
      if (resolved) next.add(noteId);
      else next.delete(noteId);
      return next;
    });
    await broadcast("timeline_note_resolved", { noteId, resolved });
  }

  async function triggerApplause() {
    const result = await roomAction(`/api/rooms/${room.id}/moments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPLAUSE" }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { state } = result.data as {
      state: { crowdEnergy: number; applauseBursts: number; heatPoints: number[] };
    };
    setEnergy(state.crowdEnergy);
    setApplauseBursts(state.applauseBursts);
    setHeatPoints(state.heatPoints);
    await broadcast("studio_moment", { action: "APPLAUSE", state });
  }

  // ── Bootstrap participants + messages ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const [roomRes, msgRes, studioRes, notesRes] = await Promise.all([
        fetch(`/api/rooms/${room.id}`),
        fetch(`/api/rooms/${room.id}/messages`),
        fetch(`/api/rooms/${room.id}/studio-state`),
        fetch(`/api/rooms/${room.id}/timeline-notes`),
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
      if (!cancelled && studioRes.ok) {
        const data = (await studioRes.json()) as {
          state: {
            sessionMode: SessionMode;
            studioVibe: StudioVibe;
            spotlightUserId: string | null;
            crowdEnergy: number;
            applauseBursts: number;
            heatPoints: number[];
            autoQueueEnabled: boolean;
            quietMode: boolean;
            speakerLimitSec: number;
          };
        };
        setSessionMode(data.state.sessionMode);
        setStudioVibe(data.state.studioVibe);
        setFocusUserId(data.state.spotlightUserId);
        setEnergy(data.state.crowdEnergy);
        setApplauseBursts(data.state.applauseBursts);
        setHeatPoints(Array.isArray(data.state.heatPoints) ? data.state.heatPoints : []);
        setAutoQueueEnabled(!!data.state.autoQueueEnabled);
        setQuietMode(!!data.state.quietMode);
        setSpeakerLimitSec(data.state.speakerLimitSec ?? 60);
      }
      if (!cancelled && notesRes.ok) {
        const data = (await notesRes.json()) as {
          notes: Array<{ id: string; atSeconds: number; body: string; resolvedAt?: string | null; user: { name: string | null } }>;
        };
        setResolvedNoteIds(new Set(data.notes.filter((n) => !!n.resolvedAt).map((n) => n.id)));
        setTimeNotes(
          data.notes.map((n) => {
            const mm = Math.floor(n.atSeconds / 60)
              .toString()
              .padStart(2, "0");
            const ss = Math.floor(n.atSeconds % 60)
              .toString()
              .padStart(2, "0");
            return { id: n.id, at: `${mm}:${ss}`, text: n.body, author: n.user.name ?? "Listener" };
          }),
        );
      }
      stateLoadedRef.current = true;
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [room.id, currentUserId]);

  useEffect(() => {
    if (!stateLoadedRef.current || !isHost || ended) return;
    if (stateSyncTimerRef.current) window.clearTimeout(stateSyncTimerRef.current);
    stateSyncTimerRef.current = window.setTimeout(() => {
      void (async () => {
        const result = await roomAction(`/api/rooms/${room.id}/studio-state`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionMode,
            studioVibe,
            spotlightUserId: focusUserId,
            crowdEnergy: energy,
            applauseBursts,
            heatPoints,
            autoQueueEnabled,
            quietMode,
            speakerLimitSec,
          }),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await broadcast("studio_state_updated", {
          sessionMode,
          studioVibe,
          spotlightUserId: focusUserId,
          crowdEnergy: energy,
          applauseBursts,
          heatPoints,
          autoQueueEnabled,
          quietMode,
          speakerLimitSec,
        });
      })();
    }, 350);
    return () => {
      if (stateSyncTimerRef.current) window.clearTimeout(stateSyncTimerRef.current);
    };
  }, [isHost, ended, room.id, sessionMode, studioVibe, focusUserId, energy, applauseBursts, heatPoints, autoQueueEnabled, quietMode, speakerLimitSec, broadcast]);

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
      .on("broadcast", { event: "studio_state_updated" }, ({ payload }) => {
        const p = payload as {
          sessionMode?: SessionMode;
          studioVibe?: StudioVibe;
          spotlightUserId?: string | null;
          crowdEnergy?: number;
          applauseBursts?: number;
          heatPoints?: number[];
          autoQueueEnabled?: boolean;
          quietMode?: boolean;
          speakerLimitSec?: number;
        };
        if (p.sessionMode) setSessionMode(p.sessionMode);
        if (p.studioVibe) setStudioVibe(p.studioVibe);
        if (p.spotlightUserId !== undefined) setFocusUserId(p.spotlightUserId);
        if (typeof p.crowdEnergy === "number") setEnergy(p.crowdEnergy);
        if (typeof p.applauseBursts === "number") setApplauseBursts(p.applauseBursts);
        if (Array.isArray(p.heatPoints)) setHeatPoints(p.heatPoints);
        if (typeof p.autoQueueEnabled === "boolean") setAutoQueueEnabled(p.autoQueueEnabled);
        if (typeof p.quietMode === "boolean") setQuietMode(p.quietMode);
        if (typeof p.speakerLimitSec === "number") setSpeakerLimitSec(p.speakerLimitSec);
      })
      .on("broadcast", { event: "timeline_note_added" }, ({ payload }) => {
        const p = payload as { note?: { id: string; at: string; text: string; author: string } };
        if (!p.note) return;
        setTimeNotes((prev) => [p.note!, ...prev.filter((n) => n.id !== p.note!.id)].slice(0, 100));
      })
      .on("broadcast", { event: "timeline_note_resolved" }, ({ payload }) => {
        const p = payload as { noteId?: string; resolved?: boolean };
        if (!p.noteId || typeof p.resolved !== "boolean") return;
        setResolvedNoteIds((prev) => {
          const next = new Set(prev);
          if (p.resolved) next.add(p.noteId!);
          else next.delete(p.noteId!);
          return next;
        });
      })
      .on("broadcast", { event: "studio_moment" }, ({ payload }) => {
        const p = payload as {
          state?: { crowdEnergy: number; applauseBursts: number; heatPoints: number[] };
        };
        if (!p.state) return;
        setEnergy(p.state.crowdEnergy);
        setApplauseBursts(p.state.applauseBursts);
        setHeatPoints(p.state.heatPoints);
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

  // ── Media Session API ──────────────────────────────────────────────
  // Surface the now-playing track on the lock screen, Bluetooth controls,
  // car head units, AirPods double-tap, etc. Listeners get a near-native
  // music-app experience without leaving the browser.
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    if (!currentSong) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: room.title,
      artwork: currentSong.coverUrl
        ? [
            { src: currentSong.coverUrl, sizes: "512x512", type: "image/jpeg" },
            { src: currentSong.coverUrl, sizes: "256x256", type: "image/jpeg" },
          ]
        : [],
    });
    navigator.mediaSession.playbackState = trackPlaying ? "playing" : "paused";
  }, [currentSong, trackPlaying, room.title]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = loudnessMatch ? 0.78 : 1;
  }, [loudnessMatch, abSide]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  // M  toggle mute (speakers/host only)
  // R  toggle hand
  // L  leave the room
  // ?  show shortcut help
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip when the user is typing in chat / picker.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ended) return;

      const key = e.key.toLowerCase();
      if (key === "m" && (role === "HOST" || role === "SPEAKER") && connected) {
        e.preventDefault();
        void toggleMute();
      } else if (key === "r" && role === "LISTENER" && connected) {
        e.preventDefault();
        void toggleHand();
      } else if (key === "l" && connected) {
        e.preventDefault();
        void disconnect();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, connected, ended]);

  // ── Render ──────────────────────────────────────────────────────────
  const speakers = Array.from(participants.values()).filter((p) => p.role !== "LISTENER");
  const handsUp = Array.from(participants.values()).filter((p) => p.handRaised && p.role === "LISTENER");
  const listeners = Array.from(participants.values()).filter((p) => p.role === "LISTENER" && !p.handRaised);

  useEffect(() => {
    if (!isHost || !connected || !autoQueueEnabled || quietMode || handsUp.length === 0) return;
    const next = handsUp[0];
    if (!next) return;
    void grantFloor(next.userId);
  }, [isHost, connected, autoQueueEnabled, quietMode, handsUp]);

  useEffect(() => {
    if (!isHost || !connected || !quietMode) return;
    const nonHostSpeakers = speakers.filter((p) => p.role === "SPEAKER");
    nonHostSpeakers.forEach((p) => {
      void revokeFloor(p.userId);
    });
  }, [isHost, connected, quietMode, speakers]);
  const roomCrew = [room.host, ...Array.from(participants.values()).filter((p) => p.userId !== room.hostId)];
  const visibleSeats = roomCrew.slice(0, 10);
  const vibeClass =
    studioVibe === "SUNSET"
      ? "from-orange-500/20 via-rose-500/10 to-transparent"
      : studioVibe === "MIDNIGHT"
        ? "from-indigo-500/20 via-cyan-400/10 to-transparent"
        : "from-fuchsia-500/20 via-cyan-400/10 to-transparent";

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
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <ShareRoomButton
            roomId={room.id}
            roomTitle={room.title}
            hostName={room.host.name ?? "An artist"}
          />
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
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/8 px-5 py-4 text-sm text-amber-100 backdrop-blur-md">
          <span aria-hidden className="text-lg">🎙️</span>
          <div className="flex-1">
            <p className="font-bold text-amber-200">
              Voice is warming up — chat is live in the meantime.
            </p>
            <p className="mt-0.5 text-xs text-amber-100/75">
              {isHost
                ? "Connect a LiveKit project in your Vercel env vars to turn on real-time audio. Until then your room runs as a text-and-track session — fans can still join, react, and license tracks."
                : "The host hasn't switched on real-time voice for this room yet. You can still chat, react, and license tracks while you're here."}
            </p>
            {isHost && (
              <a
                href="https://livekit.io/cloud"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-200 underline decoration-dotted underline-offset-2 hover:text-white"
              >
                Set up LiveKit in 60 seconds →
              </a>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Connection quality indicator */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50">Connection</span>
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${
              connectionQuality === "good"
                ? "bg-emerald-400"
                : connectionQuality === "fair"
                  ? "bg-amber-400"
                  : connectionQuality === "poor"
                    ? "bg-red-400"
                    : "bg-white/30"
            }`}
          />
          <span className="text-xs text-white/40">{connectionQuality}</span>
        </div>
      </div>

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

          <div className={`rounded-3xl border border-white/12 bg-gradient-to-b ${vibeClass} p-5 backdrop-blur-xl`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/65">Studio Session Mode</h2>
              <div className="inline-flex rounded-xl border border-white/15 bg-black/20 p-1">
                {([
                  ["PLAYBACK", "Playback"],
                  ["CRITIQUE", "Critique"],
                  ["A_AND_R", "A&R Review"],
                  ["SILENT_NOTES", "Silent Notes"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSessionMode(mode)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      sessionMode === mode ? "bg-white/90 text-black" : "text-white/65 hover:bg-white/10"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/50">3D Presence Deck</p>
                  <p className="text-xs text-white/45">{visibleSeats.length} in room</p>
                </div>
                <div className="relative h-44 overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.16),transparent_45%),linear-gradient(180deg,rgba(10,10,18,0.75),rgba(5,5,10,0.95))]">
                  <div className="absolute inset-x-3 bottom-2 h-20 rounded-[100%] border border-cyan-300/25 bg-cyan-300/10 blur-[0.5px]" />
                  {visibleSeats.map((p, index) => {
                    const x = 8 + (index % 5) * 22;
                    const row = index < 5 ? 0 : 1;
                    const y = row === 0 ? 22 : 57;
                    const isFocused = (("id" in p ? p.id : p.userId) === focusUserId);
                    const name = "username" in p ? (p.name ?? p.username ?? "Host") : p.name;
                    const image = "username" in p ? p.image : p.image;
                    const key = "id" in p ? p.id : p.userId;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFocusUserId(key)}
                        className={`absolute h-10 w-10 -translate-x-1/2 rounded-full border text-[10px] font-bold transition ${
                          isFocused ? "border-cyan-300 bg-cyan-300/30 text-white shadow-[0_0_18px_rgba(34,211,238,0.35)]" : "border-white/20 bg-white/10 text-white/80"
                        }`}
                        style={{ left: `${x}%`, top: `${y}%` }}
                        title={name}
                      >
                        {image ? (
                          <Image src={image} alt={name} fill sizes="40px" className="rounded-full object-cover" />
                        ) : (
                          <span>{name[0]?.toUpperCase()}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/50">Magic Moments</p>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={triggerApplause}
                    className="w-full rounded-xl bg-emerald-400/20 px-3 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-400/30"
                  >
                    Applause Sync
                  </button>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-white/45">Crowd energy</p>
                    <div className="mt-1 h-2 rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-300" style={{ width: `${energy}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-white/55">{energy}% · {applauseBursts} bursts</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-white/45">Goosebumps heatmap</p>
                    <div className="mt-1 flex h-9 items-end gap-1">
                      {(heatPoints.length ? heatPoints : [20, 30, 22, 40, 35, 28, 45, 38]).map((v, i) => (
                        <span key={i} className="w-2 rounded-sm bg-fuchsia-300/70" style={{ height: `${Math.max(10, v * 0.28)}px` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                  <div className={`relative h-16 w-16 overflow-hidden rounded-full bg-brand-500/20 ${
                    activeSpeakers.has(p.userId) ? "ring-4 ring-accent-400/50 shadow-[0_0_18px_rgba(0,245,255,0.12)]" : "border-2 border-brand-500/50"
                  }`}>
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

          <div className="rounded-3xl border border-white/12 bg-[#0a0a0e]/70 p-5 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Pro Review Tools</h3>
              <button
                type="button"
                onClick={() => void sendQuickMessage("Revision requested: tighten hook timing, push lead vocal +1.5dB, and reduce hi-hat harshness.")}
                className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-300/20"
              >
                Request Revision
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/45">Timestamp Notes</p>
              <div className="mb-2 flex items-center gap-2">
                <select
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value as NoteCategory)}
                  className="rounded-lg bg-black/30 px-2 py-2 text-xs text-white outline-none"
                >
                  <option value="GENERAL">General</option>
                  <option value="MIX">Mix</option>
                  <option value="MASTER">Master</option>
                  <option value="SONGWRITING">Songwriting</option>
                  <option value="ARRANGEMENT">Arrangement</option>
                  <option value="PERFORMANCE">Performance</option>
                </select>
                {replyToNoteId && (
                  <button
                    type="button"
                    onClick={() => setReplyToNoteId(null)}
                    className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/70"
                  >
                    Replying · cancel
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder={sessionMode === "SILENT_NOTES" ? "Silent note..." : "Drop a precise production note..."}
                  className="flex-1 rounded-lg bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none"
                />
                <button type="button" onClick={() => void addTimeNote()} className="rounded-lg bg-white/15 px-3 py-2 text-xs font-bold hover:bg-white/25">
                  Add
                </button>
              </div>
              <div className="mt-2 space-y-1.5">
                {timeNotes.slice(0, 4).map((n) => (
                  <div key={n.id} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                    <p className={`text-xs ${resolvedNoteIds.has(n.id) ? "text-white/35 line-through" : "text-white/70"}`}>
                      <span className="font-bold text-cyan-200">{n.at}</span> · {n.text}
                    </p>
                    <div className="mt-1 flex gap-2 text-[10px]">
                      <button type="button" onClick={() => setReplyToNoteId(n.id)} className="text-cyan-200/80 hover:text-cyan-100">
                        Reply
                      </button>
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => void toggleNoteResolved(n.id, !resolvedNoteIds.has(n.id))}
                          className="text-emerald-200/80 hover:text-emerald-100"
                        >
                          {resolvedNoteIds.has(n.id) ? "Reopen" : "Resolve"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/45">A/B Compare</p>
                <div className="space-y-2">
                  <select
                    value={compareA ?? ""}
                    onChange={(e) => setCompareA(e.target.value || null)}
                    className="w-full rounded-lg bg-black/30 px-2 py-2 text-xs text-white outline-none"
                  >
                    <option value="">Version A</option>
                    {hostSongs.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                  <select
                    value={compareB ?? ""}
                    onChange={(e) => setCompareB(e.target.value || null)}
                    className="w-full rounded-lg bg-black/30 px-2 py-2 text-xs text-white outline-none"
                  >
                    <option value="">Version B</option>
                    {hostSongs.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-white/45">
                    {compareA && compareB ? "Ready for quick A/B toggles in session." : "Pick two cuts to compare dynamics and vocal pocket."}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBlindAB((v) => !v)}
                      className={`rounded-md px-2 py-1 text-[11px] ${blindAB ? "bg-violet-400/25 text-violet-200" : "bg-black/30 text-white/55"}`}
                    >
                      Blind mode {blindAB ? "ON" : "OFF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoudnessMatch((v) => !v)}
                      className={`rounded-md px-2 py-1 text-[11px] ${loudnessMatch ? "bg-emerald-400/25 text-emerald-200" : "bg-black/30 text-white/55"}`}
                    >
                      Loudness match {loudnessMatch ? "ON" : "OFF"}
                    </button>
                  </div>
                  {compareA && compareB && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAbSide("A")} className={`rounded-md px-2 py-1 text-[11px] ${abSide === "A" ? "bg-white/20" : "bg-black/30 text-white/55"}`}>{blindAB ? "X" : "A"}</button>
                      <button type="button" onClick={() => setAbSide("B")} className={`rounded-md px-2 py-1 text-[11px] ${abSide === "B" ? "bg-white/20" : "bg-black/30 text-white/55"}`}>{blindAB ? "Y" : "B"}</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/45">Stem Focus</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(stemState) as Array<keyof typeof stemState>).map((stem) => (
                    <button
                      key={stem}
                      type="button"
                      onClick={() => setStemState((prev) => ({ ...prev, [stem]: !prev[stem] }))}
                      className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                        stemState[stem] ? "bg-emerald-400/20 text-emerald-200" : "bg-black/30 text-white/45"
                      }`}
                    >
                      {stem}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {isHost && (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/45">Host Automation</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setAutoQueueEnabled((v) => !v)} className={`rounded-md px-2 py-1 text-[11px] ${autoQueueEnabled ? "bg-cyan-400/25 text-cyan-200" : "bg-black/30 text-white/55"}`}>Auto queue {autoQueueEnabled ? "ON" : "OFF"}</button>
                  <button type="button" onClick={() => setQuietMode((v) => !v)} className={`rounded-md px-2 py-1 text-[11px] ${quietMode ? "bg-amber-400/25 text-amber-200" : "bg-black/30 text-white/55"}`}>Quiet room {quietMode ? "ON" : "OFF"}</button>
                </div>
                <div className="mt-2">
                  <label className="text-[11px] text-white/50">Speaker limit: {speakerLimitSec}s</label>
                  <input type="range" min={15} max={180} step={15} value={speakerLimitSec} onChange={(e) => setSpeakerLimitSec(Number(e.target.value))} className="w-full" />
                </div>
              </div>
            )}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/45">Audio Intelligence</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-black/30 px-2 py-1.5 text-white/70">
                  Headroom: <span className="font-bold text-emerald-200">{Math.max(3, 9 - Math.floor(energy / 18))} dB</span>
                </div>
                <div className="rounded-md bg-black/30 px-2 py-1.5 text-white/70">
                  Stereo width: <span className="font-bold text-cyan-200">{quietMode ? "Narrow" : "Balanced"}</span>
                </div>
                <div className="rounded-md bg-black/30 px-2 py-1.5 text-white/70">
                  Vocal mask risk: <span className="font-bold text-amber-200">{energy > 70 ? "Medium" : "Low"}</span>
                </div>
                <div className="rounded-md bg-black/30 px-2 py-1.5 text-white/70">
                  Clipping risk: <span className="font-bold text-rose-200">{energy > 88 ? "High" : "Low"}</span>
                </div>
              </div>
            </div>
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
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Host Control Center</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
              <button
                type="button"
                onClick={() => setStudioVibe("NEON")}
                className={`rounded-md px-2 py-1 ${studioVibe === "NEON" ? "bg-fuchsia-400/30" : "bg-white/10"}`}
              >
                Neon vibe
              </button>
              <button
                type="button"
                onClick={() => setStudioVibe("SUNSET")}
                className={`rounded-md px-2 py-1 ${studioVibe === "SUNSET" ? "bg-orange-400/30" : "bg-white/10"}`}
              >
                Sunset vibe
              </button>
              <button
                type="button"
                onClick={() => setStudioVibe("MIDNIGHT")}
                className={`rounded-md px-2 py-1 ${studioVibe === "MIDNIGHT" ? "bg-cyan-400/30" : "bg-white/10"}`}
              >
                Midnight vibe
              </button>
              <button
                type="button"
                onClick={() => setFocusUserId(speakers[0]?.userId ?? null)}
                className="rounded-md bg-white/10 px-2 py-1"
              >
                Spotlight speaker
              </button>
            </div>
          </div>
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

      {!ended && <RoomReactions roomId={room.id} disabled={!connected} />}

      {/* Host nudge — your mic is muted and nobody can hear you */}
      {isHost && connected && muted && !ended && !error && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-md px-4">
          <div className="flex items-center gap-3 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 shadow-[0_18px_38px_-15px_rgba(245,158,11,0.5)] backdrop-blur-md">
            <span aria-hidden className="text-base">🎤</span>
            <p className="text-xs text-amber-100">
              Your mic is muted — listeners can&apos;t hear you yet.
            </p>
            <button
              type="button"
              onClick={() => void toggleMute()}
              className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-300"
            >
              Unmute
            </button>
          </div>
        </div>
      )}

      {/* Track-publish unsupported (iOS WebView, etc.) */}
      {trackPublishUnsupported && isHost && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-md px-4">
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-xs text-amber-100 backdrop-blur-md">
            <p className="font-bold text-amber-200">⚠ Track playback not supported here.</p>
            <p className="mt-0.5 text-amber-100/80">
              This browser can&apos;t stream a track to listeners. Open the
              session on desktop Chrome / Safari / Firefox to play tracks
              live, or just use the mic.
            </p>
            <button
              type="button"
              onClick={() => setTrackPublishUnsupported(false)}
              className="mt-1.5 text-[11px] font-semibold text-amber-300 hover:text-amber-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Confirmation modal — replaces native confirm()/prompt() */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0a0a0e] p-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)]">
            {modal.kind === "kick" && (
              <>
                <p className="text-base font-bold text-white">Kick this listener?</p>
                <p className="mt-1 text-sm text-white/65">
                  They&apos;ll be removed from the room. They can rejoin unless
                  you also ban them.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl border border-white/15 bg-white/4 py-2 text-sm font-semibold text-white/70 hover:bg-white/8"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmKick(modal.userId)}
                    className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-bold text-white hover:bg-red-400"
                  >
                    Kick
                  </button>
                </div>
              </>
            )}
            {modal.kind === "ban" && (
              <>
                <p className="text-base font-bold text-white">Ban this listener?</p>
                <p className="mt-1 text-sm text-white/65">
                  They won&apos;t be able to rejoin this room. Optionally
                  leave a reason — visible to moderators only.
                </p>
                <input
                  type="text"
                  value={modal.reason}
                  onChange={(e) =>
                    setModal({ ...modal, reason: e.target.value })
                  }
                  placeholder="Reason (optional)"
                  maxLength={200}
                  className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400/40"
                  autoFocus
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl border border-white/15 bg-white/4 py-2 text-sm font-semibold text-white/70 hover:bg-white/8"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmBan(modal.userId, modal.reason)}
                    className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-bold text-white hover:bg-red-400"
                  >
                    Ban
                  </button>
                </div>
              </>
            )}
            {modal.kind === "end" && (
              <>
                <p className="text-base font-bold text-white">End this session?</p>
                <p className="mt-1 text-sm text-white/65">
                  Everyone will be disconnected. Any active recording stops
                  and finalizes. You can&apos;t reopen the same room — you&apos;d
                  start a fresh one.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl border border-white/15 bg-white/4 py-2 text-sm font-semibold text-white/70 hover:bg-white/8"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmEnd()}
                    className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-bold text-white hover:bg-red-400"
                  >
                    End session
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

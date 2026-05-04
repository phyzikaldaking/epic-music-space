"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Room, RoomEvent, Track } from "livekit-client";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";

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

  const lkRoomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

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

      const canPublish = data.role === "HOST" || data.role === "SPEAKER";
      if (canPublish) {
        // Don't auto-publish — let host/speaker explicitly unmute.
        setMuted(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }, [connecting, connected, ended, room.id]);

  const disconnect = useCallback(async () => {
    const lkRoom = lkRoomRef.current;
    if (lkRoom) {
      await lkRoom.disconnect();
      lkRoomRef.current = null;
    }
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current.clear();
    setConnected(false);
    setMuted(true);
  }, []);

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

  // ── Hand raising / lowering ─────────────────────────────────────────
  async function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    await fetch(`/api/rooms/${room.id}/raise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raised: next }),
    });

    // Broadcast over Supabase so the host's UI updates instantly
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      await supabase.channel(CHANNELS.room(room.id)).send({
        type: "broadcast",
        event: next ? "hand_raised" : "hand_lowered",
        payload: { userId: currentUserId },
      });
    }
  }

  // ── Host: grant / revoke floor ──────────────────────────────────────
  async function grantFloor(userId: string) {
    await fetch(`/api/rooms/${room.id}/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      await supabase.channel(CHANNELS.room(room.id)).send({
        type: "broadcast",
        event: "floor_granted",
        payload: { userId },
      });
    }
  }

  async function revokeFloor(userId: string) {
    await fetch(`/api/rooms/${room.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      await supabase.channel(CHANNELS.room(room.id)).send({
        type: "broadcast",
        event: "floor_revoked",
        payload: { userId },
      });
    }
  }

  async function endRoom() {
    if (!confirm("End this listening session for everyone?")) return;
    await fetch(`/api/rooms/${room.id}/end`, { method: "POST" });
    setEnded(true);
    await disconnect();
  }

  // ── Send chat message ───────────────────────────────────────────────
  async function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const res = await fetch(`/api/rooms/${room.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (!res.ok) {
      setError("Couldn't send message");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      const { message } = (await res.json()) as { message: Message };
      await supabase.channel(CHANNELS.room(room.id)).send({
        type: "broadcast",
        event: "message",
        payload: { message },
      });
    }
  }

  // ── Load initial participants + messages, subscribe to broadcasts ──
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
      }
      if (!cancelled && msgRes.ok) {
        const data = (await msgRes.json()) as {
          messages: { id: string; userId: string; body: string; createdAt: string; user: { name: string | null; image: string | null } }[];
        };
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            userId: m.userId,
            name: m.user.name ?? "Guest",
            image: m.user.image,
            body: m.body,
            createdAt: m.createdAt,
          })),
        );
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [room.id]);

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
      })
      .on("broadcast", { event: "hand_lowered" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setParticipants((prev) => {
          const next = new Map(prev);
          const p = next.get(userId);
          if (p) next.set(userId, { ...p, handRaised: false });
          return next;
        });
      })
      .on("broadcast", { event: "floor_granted" }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setParticipants((prev) => {
          const next = new Map(prev);
          const p = next.get(userId);
          if (p) next.set(userId, { ...p, role: "SPEAKER", handRaised: false });
          return next;
        });
        // If we were the one granted, refresh our token to get publish perms
        if (userId === currentUserId) {
          void disconnect().then(() => connect());
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
          void disconnect().then(() => connect());
        }
      })
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const { message } = payload as { message: Message };
        setMessages((prev) => [...prev, message]);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [room.id, currentUserId, connect, disconnect]);

  // ── Render ──────────────────────────────────────────────────────────
  const speakers = Array.from(participants.values()).filter((p) => p.role !== "LISTENER");
  const handsUp = Array.from(participants.values()).filter((p) => p.handRaised && p.role === "LISTENER");
  const listenerCount = participants.size - speakers.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-300">
            {ended ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                Session Ended
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
                Live Listening Room
              </>
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
        <div className="flex flex-shrink-0 gap-2">
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
            <button
              type="button"
              onClick={endRoom}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
            >
              End Session
            </button>
          )}
        </div>
      </div>

      {!liveKitOnline && (
        <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
          <span className="font-bold">Live audio infrastructure isn&apos;t configured yet.</span>{" "}
          Set <code className="rounded bg-black/30 px-1">LIVEKIT_API_KEY</code>,{" "}
          <code className="rounded bg-black/30 px-1">LIVEKIT_API_SECRET</code>, and{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_LIVEKIT_URL</code> in environment variables to enable real-time audio. Chat is fully functional below.
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
          {room.currentSong && (
            <div className="flex items-center gap-4 rounded-3xl border border-white/8 bg-white/3 p-5">
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-brand-900/30">
                {room.currentSong.coverUrl ? (
                  <Image
                    src={room.currentSong.coverUrl}
                    alt={room.currentSong.title}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">🎵</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Now playing</p>
                <p className="mt-1 truncate text-lg font-bold">{room.currentSong.title}</p>
                <p className="truncate text-sm text-white/55">{room.currentSong.artist}</p>
              </div>
              <Link
                href={`/track/${room.currentSong.id}`}
                className="flex-shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                License · ${room.currentSong.licensePrice}
              </Link>
            </div>
          )}

          {/* Stage / speakers */}
          <div className="rounded-3xl border border-white/8 bg-[#0d0d14] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">On Stage</h2>
              <span className="text-xs text-white/35">
                {listenerCount} listening
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

            {/* Local mic controls */}
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

            {/* Listener: hand raise */}
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void grantFloor(p.userId)}
                        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
                      >
                        Pass mic
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chat */}
        <aside className="flex h-[600px] flex-col rounded-3xl border border-white/8 bg-[#0d0d14]">
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
  );
}

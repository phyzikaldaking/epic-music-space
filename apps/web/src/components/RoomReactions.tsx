"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";

interface Props {
  roomId: string;
  /** Disabled when the session has ended. */
  disabled?: boolean;
}

const EMOJIS = ["🔥", "❤️", "👏", "🎵", "✨"] as const;
type Emoji = (typeof EMOJIS)[number];

type FloatReaction = {
  id: string;
  emoji: Emoji;
  /** 0-100 horizontal position so the bursts don't all stack on one column. */
  left: number;
};

const SEND_THROTTLE_MS = 600;
const FLOAT_LIFETIME_MS = 2400;

/**
 * Tap-to-fire emoji reactions that float up from the bottom of the room.
 * Broadcasts on the existing CHANNELS.room channel — no new tables, no
 * persistence (these are ephemeral by design, like Instagram Live hearts).
 *
 * Anti-spam: per-emoji client-side throttle so a fan can't ddos the channel
 * by holding down a button. Server already rate-limits the channel.
 */
export default function RoomReactions({ roomId, disabled = false }: Props) {
  const [floats, setFloats] = useState<FloatReaction[]>([]);
  const lastSentRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<
    NonNullable<ReturnType<typeof createBrowserSupabaseClient>>["channel"]
  > | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel(CHANNELS.room(roomId))
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        const { emoji } = (payload as { emoji?: string }) ?? {};
        if (!emoji || !EMOJIS.includes(emoji as Emoji)) return;
        spawnFloat(emoji as Emoji);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      void channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId]);

  function spawnFloat(emoji: Emoji) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const left = 8 + Math.random() * 84;
    setFloats((prev) => [...prev, { id, emoji, left }]);
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id));
    }, FLOAT_LIFETIME_MS);
  }

  async function send(emoji: Emoji) {
    if (disabled) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_THROTTLE_MS) return;
    lastSentRef.current = now;

    // Optimistic local burst — the broadcast may take 100-200ms.
    spawnFloat(emoji);

    const channel = channelRef.current;
    if (!channel) return;
    try {
      await channel.send({
        type: "broadcast",
        event: "reaction",
        payload: { emoji, t: now },
      });
    } catch {
      // best-effort — never throw from a tap.
    }
  }

  return (
    <>
      {/* Floating reactions overlay — fixed so it covers the whole room. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 top-0 z-30 overflow-hidden"
        aria-hidden="true"
      >
        {floats.map((f) => (
          <span
            key={f.id}
            className="absolute bottom-24 select-none text-3xl drop-shadow-[0_0_18px_rgba(255,72,128,0.6)] motion-safe:animate-[reaction-float_2.4s_ease-out_forwards] motion-reduce:opacity-0"
            style={{ left: `${f.left}%` }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      {/* Tap bar — sticky bottom-right above the chat aside. */}
      <div className="pointer-events-auto sticky bottom-4 z-40 mt-4 flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-[#0a0a0e]/85 px-2 py-1.5 shadow-[0_18px_38px_-15px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => void send(emoji)}
            disabled={disabled}
            aria-label={`React with ${emoji}`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-90 disabled:opacity-40"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Float-up keyframes — stays inside the component so disabling the
          component removes the keyframes too. */}
      <style jsx global>{`
        @keyframes reaction-float {
          0% {
            transform: translateY(0) scale(0.8);
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translateY(-20px) scale(1.05);
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translateY(-60vh) scale(1.15);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

/* eslint-disable react-hooks/purity */
"use client";

import { useEffect, useMemo, useState } from "react";

// Buyer-side flow for booking a verse listing.
//
// LIVE_SESSION: shows a simple slot picker for the next 14 days
// (rounded to the next hour, business-hours-friendly). Blocked slots
// come from /api/market/artists/[id]/availability. Buyer picks +
// adds a brief + hits "Pay & lock it in" → Stripe Checkout.
//
// ASYNC_DELIVERY: just brief + price; no calendar.

type Props = {
  listingId: string;
  sellerId: string;
  kind: "LIVE_SESSION" | "ASYNC_DELIVERY" | "ENGINEER_MIX" | "ENGINEER_MASTER";
  sessionMinutes: number;
  priceUsd: number;
};

const HOURS_TODAY_START = 9;
const HOURS_TODAY_END = 23;

export default function VerseBookFlow({
  listingId,
  sellerId,
  kind,
  sessionMinutes,
  priceUsd,
}: Props) {
  const [slot, setSlot] = useState<Date | null>(null);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Array<{ startAt: string; durationMinutes: number }>>(
    [],
  );

  // Generate the next 14 days × business hours slot grid.
  const slotGrid = useMemo(() => {
    const out: Date[] = [];
    const now = new Date();
    for (let d = 0; d < 14; d++) {
      const day = new Date(now);
      day.setDate(now.getDate() + d);
      for (let h = HOURS_TODAY_START; h < HOURS_TODAY_END; h++) {
        const slotDate = new Date(day);
        slotDate.setHours(h, 0, 0, 0);
        // Skip slots in the past or within 15 minutes.
        if (slotDate.getTime() <= Date.now() + 15 * 60 * 1000) continue;
        out.push(slotDate);
      }
    }
    return out;
  }, []);

  // Pull blocked windows from the seller. Same component handles both
  // SKUs; for ASYNC_DELIVERY this fetch is unused but cheap.
  useEffect(() => {
    if (kind !== "LIVE_SESSION") return;
    fetch(`/api/market/artists/${sellerId}/availability?days=14`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { blocked?: typeof blocked } | null) => {
        if (data?.blocked) setBlocked(data.blocked);
      })
      .catch(() => {});
  }, [kind, sellerId]);

  function isBlocked(at: Date): boolean {
    const start = at.getTime();
    const end = start + sessionMinutes * 60_000;
    for (const b of blocked) {
      const bStart = new Date(b.startAt).getTime();
      const bEnd = bStart + b.durationMinutes * 60_000;
      if (start < bEnd && end > bStart) return true;
    }
    return false;
  }

  // LIVE_SESSION and ENGINEER_MIX both put two humans in a studio room
  // at a specific time — they share the calendar-driven flow. The
  // async kinds (ASYNC_DELIVERY, ENGINEER_MASTER) skip the calendar.
  const isLiveKind = kind === "LIVE_SESSION" || kind === "ENGINEER_MIX";

  async function submit() {
    if (isLiveKind && !slot) {
      setError("Pick a session time first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/market/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          listingId,
          startAt: isLiveKind && slot ? slot.toISOString() : undefined,
          brief: brief || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Booking failed.");
        setBusy(false);
        return;
      }
      const data = (await res.json()) as { checkoutUrl?: string };
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setError("Checkout link missing.");
        setBusy(false);
      }
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  }

  // Group slots by day so the grid renders Day → Hour rows.
  const byDay = useMemo(() => {
    const map = new Map<string, Date[]>();
    for (const s of slotGrid) {
      const key = s.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [slotGrid]);

  return (
    <div className="space-y-4">
      {isLiveKind && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
            Pick a session time · {sessionMinutes}-min slot
          </div>
          <div className="max-h-72 overflow-y-auto space-y-3">
            {byDay.map(([dayLabel, slots]) => (
              <div key={dayLabel}>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/45">
                  {dayLabel}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((s) => {
                    const blocked = isBlocked(s);
                    const picked = slot?.getTime() === s.getTime();
                    return (
                      <button
                        key={s.toISOString()}
                        type="button"
                        disabled={blocked}
                        onClick={() => setSlot(s)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-mono transition ${
                          picked
                            ? "border-amber-400 bg-amber-400 text-black"
                            : blocked
                              ? "border-white/10 bg-white/[0.02] text-white/25 line-through cursor-not-allowed"
                              : "border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.1]"
                        }`}
                      >
                        {s.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <label className="text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
          Brief (optional)
        </label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value.slice(0, 2000))}
          placeholder="What you want from this verse. Theme, energy, references, lines you want to hear..."
          rows={4}
          className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm outline-none focus:border-amber-400"
        />
        <div className="mt-0.5 text-right text-[9px] text-white/45">
          {brief.length}/2000
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || (isLiveKind && !slot)}
        className="block w-full rounded-2xl bg-amber-400 px-4 py-3 text-center text-sm font-black uppercase tracking-widest text-black hover:bg-amber-300 disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : `Pay $${priceUsd.toFixed(0)} & lock it in`}
      </button>
      <p className="text-center text-[10px] uppercase tracking-widest text-white/40">
        Funds held in escrow · released on session signoff
      </p>
    </div>
  );
}

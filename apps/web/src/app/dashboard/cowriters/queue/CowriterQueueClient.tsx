"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Interest = {
  id: string;
  status: string;
  shareBpsRequested: number;
  priceCents: number;
  message: string | null;
  createdAt: string;
  song: { id: string; title: string };
  fan: { id: string; name: string | null; username: string | null; image: string | null; email: string | null };
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  ACCEPTED: { label: "Accepted", cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" },
  DECLINED: { label: "Declined", cls: "border-red-400/40 bg-red-400/10 text-red-300" },
};

function pctFromBps(bps: number) {
  return Math.round((bps / 10) * 10) / 10; // 50 bps => 5.0%
}

function usdFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

export default function CowriterQueueClient({ initialInterests }: { initialInterests: Interest[] }) {
  const [items, setItems] = useState<Interest[]>(initialInterests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "accepted" | "declined">("pending");

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    const target = filter.toUpperCase();
    return items.filter((i) => i.status === target);
  }, [items, filter]);

  async function act(id: string, action: "accept" | "decline") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/cowriter/interests/${id}/${action}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { interest?: { id: string; status: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Action failed.");
      if (data.interest?.status) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: data.interest!.status } : i)));
      }
    } catch (err) {
      // Keep it simple: surface failure inline via a status flip to "PENDING"
      // is worse than doing nothing. We'll just no-op.
      console.warn("[CowriterQueue] action failed", err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-sm">
          {[
            ["pending", "Pending"],
            ["accepted", "Accepted"],
            ["declined", "Declined"],
            ["all", "All"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k as typeof filter)}
              className={`rounded-full px-4 py-1.5 transition ${
                filter === k
                  ? "bg-brand-500 text-white"
                  : "border border-white/10 text-white/60 hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-12 text-center text-sm text-white/45">
          No offers in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => {
            const meta = STATUS_META[i.status] ?? { label: i.status, cls: "border-white/15 bg-white/5 text-white/55" };
            const fanName = i.fan.name ?? i.fan.username ?? i.fan.email ?? "Fan";
            return (
              <div key={i.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/track/${i.song.id}`} className="text-sm font-bold hover:underline">
                        {i.song.title}
                      </Link>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.cls}`}>
                        {meta.label}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/55">
                        {pctFromBps(i.shareBpsRequested)}% share
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/55">
                        ${usdFromCents(i.priceCents)} offer
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      {i.fan.image ? (
                        <Image
                          src={i.fan.image}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 rounded-full border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full border border-white/10 bg-white/5" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white/80">{fanName}</p>
                        <p className="text-[11px] text-white/45">
                          {new Date(i.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {i.message ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 whitespace-pre-line">
                        {i.message}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {i.status === "PENDING" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void act(i.id, "decline")}
                          disabled={busyId === i.id}
                          className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/10 disabled:opacity-50"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => void act(i.id, "accept")}
                          disabled={busyId === i.id}
                          className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50"
                        >
                          Accept
                        </button>
                      </>
                    ) : (
                      <Link
                        href={`/track/${i.song.id}`}
                        className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/10"
                      >
                        Open track
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


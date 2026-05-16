/* eslint-disable react-hooks/purity */
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  fetchArtistPrice,
  fetchArtistSparkline,
} from "@/lib/rapStock";

export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { name: true, username: true },
  });
  const name = user?.name ?? user?.username ?? "Artist";
  return { title: `${name} · Rap Stock Market` };
}

// Single-artist ticker page. Shows current price, 30-day sparkline,
// signal breakdown, and the artist's active verse listings with
// buy/book buttons.
export default async function ArtistTickerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artist = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      subscriptionTier: true,
    },
  });
  if (!artist) notFound();

  const [{ price, signals }, sparkline, listings] = await Promise.all([
    fetchArtistPrice(id),
    fetchArtistSparkline(id, 30),
    prisma.verseListing.findMany({
      where: { sellerId: id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // 24h delta: compare current price to the closest snapshot from
  // ~24h ago. Falls back to 0 if sparkline doesn't reach back.
  let delta24h = 0;
  if (sparkline.length > 0) {
    const targetSec = Date.now() / 1000 - 24 * 60 * 60;
    let closest = sparkline[0];
    let bestDist = Math.abs(closest.atSec - targetSec);
    for (const p of sparkline) {
      const d = Math.abs(p.atSec - targetSec);
      if (d < bestDist) {
        bestDist = d;
        closest = p;
      }
    }
    delta24h = price - closest.price;
  }
  const pct = price > 0 ? (delta24h / price) * 100 : 0;
  const up = delta24h >= 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/market"
        className="text-[10px] uppercase tracking-widest text-white/45 hover:underline"
      >
        ← Market
      </Link>

      <header className="mt-3 flex items-center gap-4">
        {artist.image ? (
          <Image
            src={artist.image}
            alt={artist.name ?? ""}
            width={72}
            height={72}
            className="h-18 w-18 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-18 w-18 place-items-center rounded-full bg-white/10 text-2xl font-black">
            {(artist.name ?? artist.username ?? "?")[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">
            Ticker
          </p>
          <h1 className="mt-1 font-display text-3xl uppercase tracking-wide">
            {artist.name ?? artist.username ?? "Artist"}
          </h1>
          {artist.username && (
            <Link
              href={`/studio/${artist.username}`}
              className="text-xs text-white/45 hover:underline"
            >
              @{artist.username}
            </Link>
          )}
        </div>
        <div className="text-right">
          <div className="font-display text-4xl">${price.toFixed(2)}</div>
          <div className={`text-sm font-black ${up ? "text-emerald-300" : "text-red-300"}`}>
            {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}% · 24h
          </div>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
          30-day price
        </h2>
        <SparklineLarge points={sparkline} up={up} />
      </section>

      <section className="mt-6 grid gap-2 sm:grid-cols-2">
        <SignalCard label="Verse revenue · 30d" value={`$${signals.verseRevenue30d.toFixed(0)}`} weight="40%" />
        <SignalCard label="Avg verse price" value={`$${signals.avgVersePrice.toFixed(0)}`} weight="20%" />
        <SignalCard label="Repeat buyer rate" value={`${(signals.repeatBuyerRate * 100).toFixed(0)}%`} weight="15%" />
        <SignalCard label="Bookings · 30d" value={String(signals.bookings30d)} weight="15%" />
        <SignalCard label="Follower growth · 30d" value={`+${signals.followerGrowth30d}`} weight="10%" />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-white/70">
          Verses for sale
        </h2>
        {listings.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-sm text-white/55">
            No active listings.
          </p>
        ) : (
          <ul className="space-y-2">
            {listings.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/65">
                      {l.kind === "LIVE_SESSION"
                        ? `Live · ${l.sessionMinutes}min`
                        : `Async · ${l.deliveryDays}d`}
                    </span>
                    <h3 className="text-sm font-bold">{l.title}</h3>
                  </div>
                  {l.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-white/55">
                      {l.description}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-display text-xl text-amber-300">
                    ${Number(l.priceUsd).toFixed(0)}
                  </div>
                  <Link
                    href={`/market/verses/${l.id}`}
                    className="mt-1 inline-block rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black hover:bg-amber-300"
                  >
                    {l.kind === "LIVE_SESSION" ? "Book" : "Buy"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SignalCard({ label, value, weight }: { label: string; value: string; weight: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/55">
        <span>{label}</span>
        <span className="rounded-full bg-white/10 px-1.5 py-0.5">{weight}</span>
      </div>
      <div className="mt-1 font-display text-2xl">{value}</div>
    </div>
  );
}

function SparklineLarge({
  points,
  up,
}: {
  points: Array<{ atSec: number; price: number }>;
  up: boolean;
}) {
  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-[11px] text-white/45">
        Not enough history yet — check back after a few snapshots.
      </p>
    );
  }
  const w = 800;
  const h = 120;
  const xs = points.map((p) => p.atSec);
  const ys = points.map((p) => p.price);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = Math.max(1, maxX - minX);
  const rangeY = Math.max(0.01, maxY - minY);
  const path = points
    .map((p, i) => {
      const x = ((p.atSec - minX) / rangeX) * w;
      const y = h - ((p.price - minY) / rangeY) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full">
      <path d={path} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth={1.5} />
    </svg>
  );
}

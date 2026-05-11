import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@ems/db";
import { computeStockPrice, fetchArtistSignals } from "@/lib/rapStock";

export const metadata: Metadata = {
  title: "Rap Stock Market — verses, sessions, tickers",
  description:
    "The Dow Jones of rap. Browse verses for sale, book live joint studio sessions, watch artists' stock prices ride on demand.",
};

export const revalidate = 60;

// /market — the big board. Shows top movers (24h price change),
// top by price, and the active verse marketplace. Stock prices are
// informational; buyers don't trade shares, they buy verses.

type ArtistRow = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  price: number;
  delta24h: number;
  recent: Array<{ atSec: number; price: number }>;
};

async function loadTopArtists(): Promise<ArtistRow[]> {
  // Pull the most-recent snapshot per artist + the snapshot from
  // ~24h ago in one round trip. Postgres window functions would be
  // tidier but Prisma raw is overkill — two queries + join in JS.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Latest snapshot per artist via `distinct` + reverse order.
  const latest = await prisma.artistStockSnapshot.findMany({
    distinct: ["artistId"],
    orderBy: { capturedAt: "desc" },
    take: 200,
    include: {
      artist: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
        },
      },
    },
  });

  // 24h-prior snapshot lookup, grouped by artist.
  const priorRows = await prisma.artistStockSnapshot.findMany({
    where: {
      artistId: { in: latest.map((l) => l.artistId) },
      capturedAt: { gte: since48h, lt: since24h },
    },
    orderBy: { capturedAt: "asc" },
  });
  const priorByArtist = new Map<string, Prisma.Decimal>();
  for (const r of priorRows) {
    // Asc order means the last entry per artist is the *closest* to
    // 24h ago — we want the most recent value before the 24h mark.
    priorByArtist.set(r.artistId, r.price);
  }

  // 48h sparkline points per artist (rough hourly granularity).
  const sparkRows = await prisma.artistStockSnapshot.findMany({
    where: {
      artistId: { in: latest.map((l) => l.artistId) },
      capturedAt: { gte: since48h },
    },
    orderBy: { capturedAt: "asc" },
    select: { artistId: true, capturedAt: true, price: true },
  });
  const sparkByArtist = new Map<string, Array<{ atSec: number; price: number }>>();
  for (const r of sparkRows) {
    const list = sparkByArtist.get(r.artistId) ?? [];
    list.push({
      atSec: Math.floor(r.capturedAt.getTime() / 1000),
      price: Number(r.price),
    });
    sparkByArtist.set(r.artistId, list);
  }

  return latest.map((l) => {
    const prior = priorByArtist.get(l.artistId);
    const priceNow = Number(l.price);
    const pricePrior = prior ? Number(prior) : priceNow;
    return {
      id: l.artist.id,
      name: l.artist.name,
      username: l.artist.username,
      image: l.artist.image,
      price: priceNow,
      delta24h: priceNow - pricePrior,
      recent: sparkByArtist.get(l.artistId) ?? [],
    };
  });
}

async function loadFeaturedListings() {
  return prisma.verseListing.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: {
      seller: {
        select: { id: true, name: true, username: true, image: true },
      },
    },
  });
}

export default async function MarketPage() {
  const [artists, listings] = await Promise.all([
    loadTopArtists(),
    loadFeaturedListings(),
  ]);

  // If no snapshots exist yet (first deploy / empty DB), live-compute
  // a small board so the page isn't empty. Pricey to do for many
  // artists, so cap at 10.
  let liveBoard = artists;
  if (artists.length === 0) {
    const seedArtists = await prisma.user.findMany({
      where: {
        subscriptionTier: { in: ["PRO", "PRIME", "TEAM", "LABEL_TIER"] },
        verseListings: { some: { status: "ACTIVE" } },
      },
      select: { id: true, name: true, username: true, image: true },
      take: 10,
    });
    liveBoard = await Promise.all(
      seedArtists.map(async (a) => {
        const signals = await fetchArtistSignals(a.id);
        return {
          id: a.id,
          name: a.name,
          username: a.username,
          image: a.image,
          price: computeStockPrice(signals),
          delta24h: 0,
          recent: [],
        };
      }),
    );
  }

  const topMovers = [...liveBoard].sort((a, b) => Math.abs(b.delta24h) - Math.abs(a.delta24h)).slice(0, 6);
  const topByPrice = [...liveBoard].sort((a, b) => b.price - a.price).slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">
          Rap Stock Market
        </p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-wide sm:text-4xl">
          Where verses move the market
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/65">
          Every artist&apos;s ticker tracks composite demand — verse revenue,
          session bookings, and follower momentum. Tickers are informational;
          the trade happens when you book a verse or a joint studio
          session. 10% platform fee, 90% to the artist.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.24em] text-white/70">
            Top movers · 24h
          </h2>
          <Link
            href="/market/list"
            className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black hover:bg-amber-300"
          >
            List your verse
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topMovers.length === 0 ? (
            <p className="col-span-full rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-sm text-white/55">
              Market just opened. As PRO artists list verses, tickers fill in here.
            </p>
          ) : (
            topMovers.map((a) => <MoverCard key={a.id} artist={a} />)
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-white/70">
          Big board
        </h2>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-widest text-white/55">
              <tr>
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">24h</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">Sparkline</th>
              </tr>
            </thead>
            <tbody>
              {topByPrice.map((a) => (
                <BoardRow key={a.id} artist={a} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-white/70">
          Verses for sale
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.length === 0 ? (
            <p className="col-span-full rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-sm text-white/55">
              No verse listings yet — be the first.
            </p>
          ) : (
            listings.map((l) => (
              <Link
                key={l.id}
                href={`/market/verses/${l.id}`}
                className="rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:border-amber-400/40"
              >
                <div className="flex items-center gap-2">
                  {l.seller.image ? (
                    <Image
                      src={l.seller.image}
                      alt={l.seller.name ?? ""}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs font-black">
                      {(l.seller.name ?? l.seller.username ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-semibold">
                    {l.seller.name ?? l.seller.username ?? "artist"}
                  </span>
                </div>
                <h3 className="mt-2 line-clamp-2 text-sm font-bold">{l.title}</h3>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 uppercase tracking-widest text-white/65">
                    {l.kind === "LIVE_SESSION" ? "Live session" : "Async verse"}
                  </span>
                  <span className="font-bold text-amber-300">
                    ${Number(l.priceUsd).toFixed(0)}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function MoverCard({ artist }: { artist: ArtistRow }) {
  const pct = artist.price > 0 ? (artist.delta24h / artist.price) * 100 : 0;
  const up = artist.delta24h >= 0;
  return (
    <Link
      href={`/market/artist/${artist.id}`}
      className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-4 transition hover:border-amber-400/40"
    >
      <div className="flex items-center gap-2">
        {artist.image ? (
          <Image
            src={artist.image}
            alt={artist.name ?? ""}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs font-black">
            {(artist.name ?? artist.username ?? "?")[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 truncate text-sm font-bold">
          {artist.name ?? artist.username ?? "artist"}
        </div>
        <div
          className={`text-xs font-black ${up ? "text-emerald-300" : "text-red-300"}`}
        >
          {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-[10px] uppercase tracking-widest text-white/45">Price</div>
        <div className="font-display text-xl">${artist.price.toFixed(2)}</div>
      </div>
      <Sparkline points={artist.recent} up={up} />
    </Link>
  );
}

function BoardRow({ artist }: { artist: ArtistRow }) {
  const pct = artist.price > 0 ? (artist.delta24h / artist.price) * 100 : 0;
  const up = artist.delta24h >= 0;
  return (
    <tr className="border-t border-white/5 hover:bg-white/[0.03]">
      <td className="px-3 py-2">
        <Link
          href={`/market/artist/${artist.id}`}
          className="flex items-center gap-2 hover:underline"
        >
          {artist.image ? (
            <Image
              src={artist.image}
              alt={artist.name ?? ""}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-[10px] font-black">
              {(artist.name ?? artist.username ?? "?")[0]?.toUpperCase()}
            </div>
          )}
          <span>{artist.name ?? artist.username ?? "artist"}</span>
        </Link>
      </td>
      <td className="px-3 py-2 text-right font-mono">${artist.price.toFixed(2)}</td>
      <td
        className={`px-3 py-2 text-right font-mono ${up ? "text-emerald-300" : "text-red-300"}`}
      >
        {up ? "+" : ""}{pct.toFixed(1)}%
      </td>
      <td className="px-3 py-2 text-right hidden sm:table-cell">
        <Sparkline points={artist.recent} up={up} compact />
      </td>
    </tr>
  );
}

function Sparkline({
  points,
  up,
  compact,
}: {
  points: Array<{ atSec: number; price: number }>;
  up: boolean;
  compact?: boolean;
}) {
  if (points.length < 2) {
    return <div className={compact ? "h-4" : "h-8 mt-2"} />;
  }
  const w = compact ? 80 : 200;
  const h = compact ? 16 : 32;
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
      const y = h - ((p.price - minY) / rangeY) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className={compact ? "inline-block" : "mt-2 block w-full"}>
      <path
        d={path}
        fill="none"
        stroke={up ? "#34d399" : "#f87171"}
        strokeWidth={compact ? 1 : 1.5}
      />
    </svg>
  );
}

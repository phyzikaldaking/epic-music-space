import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Investors",
  description:
    "Live platform metrics, traction, and the thesis behind Epic Music Space.",
  openGraph: {
    title: "Investors",
    description:
      "Live platform metrics, traction, and the thesis behind Epic Music Space.",
    type: "website",
  },
};

export const revalidate = 300; // refresh every 5 min

interface Metrics {
  artists: number;
  songs: number;
  licenses: number;
  posts: number;
  followsTotal: number;
  gmvDollars: number;
  paidOutDollars: number;
  newUsersLast7d: number;
  newSongsLast7d: number;
}

async function getMetrics(): Promise<Metrics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    artists,
    songs,
    licenses,
    posts,
    followsTotal,
    gmvAgg,
    payoutsAgg,
    newUsersLast7d,
    newSongsLast7d,
  ] = await Promise.all([
    prisma.user.count({ where: { role: { not: "LISTENER" } } }),
    prisma.song.count({ where: { isActive: true } }),
    prisma.licenseToken.count({ where: { status: "ACTIVE" } }),
    prisma.post.count({ where: { isPublished: true } }),
    prisma.userFollow.count(),
    prisma.transaction.aggregate({
      where: { status: "SUCCEEDED" },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.song.count({ where: { createdAt: { gte: sevenDaysAgo }, isActive: true } }),
  ]);

  return {
    artists,
    songs,
    licenses,
    posts,
    followsTotal,
    gmvDollars: Number(gmvAgg._sum.amount ?? 0),
    paidOutDollars: Number(payoutsAgg._sum.amount ?? 0),
    newUsersLast7d,
    newSongsLast7d,
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function InvestorsPage() {
  let metrics: Metrics | null = null;
  try {
    metrics = await getMetrics();
  } catch (err) {
    console.error("[investors] metrics fetch failed", err);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <header className="mb-12 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-300">
          For investors
        </p>
        <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">
          A music platform where artists own their upside.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/55">
          Epic Music Space is a marketplace, social timeline, live-room platform,
          and AI-curated charts — built so independent artists keep majority
          revenue and license tokens trade on a real economy.
        </p>
      </header>

      {metrics ? (
        <section className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Artists + creators" value={formatCount(metrics.artists)} />
          <Metric label="Active tracks" value={formatCount(metrics.songs)} />
          <Metric label="Licenses sold" value={formatCount(metrics.licenses)} />
          <Metric label="Lifetime GMV" value={formatMoney(metrics.gmvDollars)} />
          <Metric label="Paid out to creators" value={formatMoney(metrics.paidOutDollars)} highlight />
          <Metric label="Posts published" value={formatCount(metrics.posts)} />
          <Metric label="Follow graph" value={`${formatCount(metrics.followsTotal)} edges`} />
          <Metric
            label="New signups · 7d"
            value={formatCount(metrics.newUsersLast7d)}
            secondary={`${metrics.newSongsLast7d} new tracks`}
          />
        </section>
      ) : (
        <p className="mb-12 rounded-2xl border border-white/10 bg-white/4 px-4 py-6 text-center text-sm text-white/55">
          Metrics are temporarily unavailable. Refresh in a minute.
        </p>
      )}

      <section className="mb-12 grid gap-5 sm:grid-cols-2">
        <Pillar
          title="Artists keep majority revenue"
          body="Every license sale routes through Stripe Connect to the artist's own balance — payouts run weekly. We take a single transparent platform cut, no per-stream pennies."
        />
        <Pillar
          title="The full creator stack"
          body="Music marketplace, video timeline, live audio rooms, services (mix/master/templates), label tooling, AI scoring, and rivalry-style versus battles — one product, one identity, one wallet."
        />
        <Pillar
          title="Real-time economy"
          body="License tokens have supply caps. Boost auctions, versus battles, and limited drops produce genuine scarcity — the leaderboard reflects market demand, not vanity metrics."
        />
        <Pillar
          title="Defensible data"
          body="AI-derived EMS Score per track, taste profiles per listener, real Stripe-verified GMV, and a Mux-powered video graph — proprietary signals competitors can't reconstruct."
        />
      </section>

      <section className="mb-12 rounded-3xl border border-white/8 bg-gradient-to-br from-brand-500/8 via-accent-500/5 to-transparent p-8">
        <h2 className="text-2xl font-extrabold">How we make money</h2>
        <ul className="mt-4 space-y-2 text-sm text-white/70">
          <li>· <strong>License marketplace fee</strong> — single platform percentage on every license sale, transparent at checkout.</li>
          <li>· <strong>Subscription tiers</strong> — Starter / Pro / Prime / Team / Label-tier, gating upload counts, versus access, analytics, and city placement.</li>
          <li>· <strong>Boost auctions</strong> — pay-to-promote rounds run hourly; winners get cycle visibility, losers get badges, all flow back to the platform.</li>
          <li>· <strong>Services marketplace</strong> — engineers and producers fulfil mix/master/beats; we hold escrow and take a fee on completion.</li>
          <li>· <strong>Ad placements</strong> — non-intrusive billboards on dashboards and studio pages, sold per-impression.</li>
        </ul>
      </section>

      <section className="mb-12 rounded-3xl border border-white/8 bg-white/3 p-8">
        <h2 className="text-2xl font-extrabold">Where we are right now</h2>
        <p className="mt-3 text-sm text-white/65">
          Production deployed on Vercel + Supabase + Stripe. Twenty-plus artists
          onboarding this week. Mux video timeline, LiveKit audio rooms, and AI
          scoring all in production. Reconciliation cron runs nightly and
          alerts on any drift between Stripe and our ledger. Sentry, status
          page, and audit log all live before the first dollar moved.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/marketplace"
            className="rounded-xl border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-bold text-brand-200 hover:bg-brand-500/25"
          >
            See the marketplace →
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10"
          >
            Live leaderboard
          </Link>
          <Link
            href="/status"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10"
          >
            System status
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/3 p-8 text-center">
        <h2 className="text-2xl font-extrabold">Talk to us</h2>
        <p className="mt-3 text-sm text-white/65">
          Email{" "}
          <a className="text-brand-300 hover:underline" href="mailto:investors@epicmusicspace.com">
            investors@epicmusicspace.com
          </a>
          {" "}or open a ticket on our{" "}
          <Link className="text-brand-300 hover:underline" href="/support">
            support page
          </Link>
          . We respond within one business day.
        </p>
      </section>

      <p className="mt-12 text-center text-xs text-white/30">
        Metrics on this page are pulled live from production and refresh every 5 minutes.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  secondary,
  highlight,
}: {
  label: string;
  value: string;
  secondary?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight
          ? "border-emerald-500/35 bg-emerald-500/8"
          : "border-white/10 bg-white/3"
      }`}
    >
      <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</p>
      {secondary && <p className="mt-1 text-xs text-white/45">{secondary}</p>}
    </div>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-6">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm text-white/65 leading-relaxed">{body}</p>
    </div>
  );
}

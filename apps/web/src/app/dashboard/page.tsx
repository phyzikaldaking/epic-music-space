import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatPrice } from "@ems/utils";
import { BADGE_META } from "@/lib/badges";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: {
      licenses: {
        include: { song: true },
        orderBy: { purchasedAt: "desc" },
        take: 10,
      },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      songs: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { _count: { select: { versusMatchesA: true, versusMatchesB: true } } },
      },
      studio: { select: { username: true } },
      badges: { orderBy: { awardedAt: "desc" } },
      auctionsCreated: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          song: { select: { id: true, title: true } },
          _count: { select: { bids: true } },
        },
      },
      auctionBids: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          auction: {
            include: { song: { select: { id: true, title: true } } },
          },
        },
      },
    },
  });

  // Invite data
  const inviteData = await (async () => {
    const invite = await prisma.inviteCode.findFirst({
      where: { createdById: user.id },
      orderBy: { createdAt: "asc" },
    });
    if (!invite) return null;
    const usedCount = await prisma.inviteCode.count({
      where: { createdById: user.id, usedById: { not: null } },
    });
    return { code: invite.code, usedCount };
  })();

  const totalInvested = user.transactions
    .filter((t) => t.status === "SUCCEEDED" && t.type === "LICENSE_PURCHASE")
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const totalSongsSold = user.songs.reduce((acc, s) => acc + s.soldLicenses, 0);

  // Artist flag — must be declared before any conditional checks below
  const isArtist = user.role !== "LISTENER";

  // Artist: total earnings = sum of all succeeded license_purchase amounts across artist's songs
  const artistEarnings = isArtist
    ? user.songs.reduce(
        (sum: number, s: typeof user.songs[number]) => sum + Number(s.licensePrice) * s.soldLicenses,
        0
      )
    : 0;

  // Stripe Connect status (artists only)
  let connectStatus: { connected: boolean; onboardingComplete: boolean } = {
    connected: false,
    onboardingComplete: false,
  };
  if (isArtist && user.stripeConnectId) {
    connectStatus = { connected: true, onboardingComplete: false };
    try {
      const { stripe } = await import("@/lib/stripe");
      const account = await stripe.accounts.retrieve(user.stripeConnectId);
      connectStatus = {
        connected: true,
        onboardingComplete:
          account.charges_enabled && account.payouts_enabled && account.details_submitted,
      };
    } catch {
      // stripe not available in this env — assume connected
      connectStatus = { connected: true, onboardingComplete: false };
    }
  }

  const STAT_CARDS = [
    {
      label: "Licenses held",
      value: user.licenses.length.toString(),
      icon: "01",
      border: "border-brand-500/30",
      bg: "bg-brand-500/8",
      textColor: "text-brand-400",
    },
    {
      label: "Total invested",
      value: formatPrice(totalInvested),
      icon: "02",
      border: "border-gold-500/30",
      bg: "bg-gold-500/6",
      textColor: "text-gold-400",
    },
    ...(isArtist
      ? [
          {
            label: "Songs uploaded",
            value: user.songs.length.toString(),
            icon: "03",
            border: "border-accent-500/30",
            bg: "bg-accent-500/6",
            textColor: "text-accent-400",
          },
          {
            label: "Licenses sold",
            value: totalSongsSold.toString(),
            icon: "04",
            border: "border-gold-500/30",
            bg: "bg-gold-500/6",
            textColor: "text-gold-400",
          },
        ]
      : [
          {
            label: "Account type",
            value: user.role,
            icon: "03",
            border: "border-white/15",
            bg: "bg-white/4",
            textColor: "text-white/70",
          },
        ]),
  ];

  return (
    <div className="min-h-screen bg-[#050509]">
      <div className="mx-auto max-w-7xl px-4 py-10">
        {/* ── Header ──────────────────────────────────── */}
        <div className="mb-10 flex flex-col gap-6 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 border-l-2 border-accent-400 pl-3 text-xs font-black uppercase tracking-[0.24em] text-accent-300">
              Workspace
            </p>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              {user.name ?? user.email}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/42">
              <span className="rounded-md border border-white/12 px-2.5 py-1">
                {user.role}
              </span>
              {user.studio && (
                <span className="rounded-md border border-white/12 px-2.5 py-1">
                  @{user.studio.username}
                </span>
              )}
            </div>
          </div>
          {user.role !== "LISTENER" && (
            <Link
              href="/studio/new"
              className="inline-flex h-11 items-center justify-center rounded-md bg-white px-5 text-sm font-black text-[#050509] transition hover:bg-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Upload song
            </Link>
          )}
        </div>

        {/* ── Studio setup prompt (artists without a studio) ─────────────── */}
        {isArtist && !user.studio && (
          <div className="mb-8 flex flex-col gap-4 rounded-lg border border-brand-500/30 bg-brand-500/8 px-5 py-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-semibold text-brand-300">Set up your artist studio</p>
              <p className="text-sm text-white/45 mt-0.5">
                Claim your studio username so fans can find and follow you.
              </p>
            </div>
            <Link
              href="/profile/edit"
              className="flex-shrink-0 rounded-md bg-white px-5 py-2 text-sm font-black text-[#050509] transition hover:bg-accent-300"
            >
              Set up studio
            </Link>
          </div>
        )}

        {/* ── Stripe Connect payout setup prompt ──────── */}
        {isArtist && !connectStatus.onboardingComplete && (
          <div className={`mb-8 flex flex-col gap-4 rounded-lg border px-5 py-5 sm:flex-row sm:items-center ${
            connectStatus.connected
              ? "border-yellow-500/40 bg-yellow-500/6"
              : "border-gold-500/40 bg-gold-500/6"
          }`}>
            <div className="flex-1">
              <p className={`font-semibold ${connectStatus.connected ? "text-yellow-300" : "text-gold-300"}`}>
                {connectStatus.connected ? "Complete payout setup" : "Set up payouts to get paid"}
              </p>
              <p className="text-sm text-white/45 mt-0.5">
                {connectStatus.connected
                  ? "Finish your Stripe verification to receive automatic payouts when licenses sell."
                  : "Connect Stripe to receive 90% of every license sale directly to your bank account."}
              </p>
            </div>
            <Link
              href="/dashboard/payouts"
              className={`flex-shrink-0 rounded-md px-5 py-2 text-sm font-black transition ${
                connectStatus.connected
                  ? "bg-yellow-400 text-[#090a0f] hover:bg-yellow-300"
                  : "bg-gold-400 text-[#090a0f] hover:bg-gold-300"
              }`}
            >
              {connectStatus.connected ? "Continue setup" : "Set up payouts"}
            </Link>
          </div>
        )}
        {isArtist && connectStatus.onboardingComplete && (
          <div className="mb-8 flex flex-col gap-4 rounded-lg border border-green-500/30 bg-green-500/6 px-5 py-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-semibold text-green-300">Payouts enabled</p>
              <p className="text-sm text-white/45 mt-0.5">
                You receive 90% of every license sale automatically via Stripe.
              </p>
            </div>
            <Link
              href="/dashboard/payouts"
              className="flex-shrink-0 rounded-md border border-green-500/30 bg-green-700/50 px-5 py-2 text-sm font-bold text-green-300 transition hover:bg-green-700/70"
            >
              Manage payouts
            </Link>
          </div>
        )}

        {/* ── Stat cards ──────────────────────────────── */}
        <div className="mb-12 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_CARDS.map((stat) => (
            <div
              key={stat.label}
              className="bg-[#0a0b10] p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
                  {stat.label}
                </p>
                <span className="text-xs font-black text-white/24">{stat.icon}</span>
              </div>
              <p className={`text-3xl font-black leading-none ${stat.textColor}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── My Licenses ─────────────────────────────── */}
        <section className="mb-12">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold">My Licenses</h2>
            {user.licenses.length > 0 && (
              <span className="text-sm text-white/35">
                {user.licenses.length} active
              </span>
            )}
          </div>
          {user.licenses.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#141414] p-10 text-center">
              <p className="mb-2 text-4xl">🎟️</p>
              <p className="font-semibold text-white/50">No licenses yet.</p>
              <Link
                href="/marketplace"
                className="mt-3 inline-block rounded-xl bg-brand-500/15 border border-brand-500/30 px-5 py-2 text-sm font-semibold text-brand-400 hover:bg-brand-500/25 transition"
              >
                Browse the marketplace →
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
              <table className="w-full text-sm">
                <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Song</th>
                    <th className="px-5 py-3.5 text-left">License #</th>
                    <th className="px-5 py-3.5 text-left">Price paid</th>
                    <th className="px-5 py-3.5 text-left">Status</th>
                    <th className="px-5 py-3.5 text-left">Purchased</th>
                  </tr>
                </thead>
                <tbody>
                  {user.licenses.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-white/5 transition hover:bg-white/3"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/track/${l.song.id}`}
                          className="font-semibold text-brand-400 hover:underline"
                        >
                          {l.song.title}
                        </Link>
                        <div className="text-xs text-white/35">{l.song.artist}</div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-white/60">
                        #{l.tokenNumber}
                      </td>
                      <td className="px-5 py-3.5 text-gold-400 font-semibold">
                        {formatPrice(l.price)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            l.status === "ACTIVE"
                              ? "bg-green-500/15 text-green-400 border border-green-500/25"
                              : "bg-red-500/15 text-red-400 border border-red-500/25"
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-white/40 text-xs">
                        {new Date(l.purchasedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Artist: My Songs ─────────────────────────── */}
        {user.role !== "LISTENER" && (
          <section className="mb-12">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">My Songs</h2>
              <Link
                href="/studio/new"
                className="rounded-lg bg-brand-500/15 border border-brand-500/30 px-4 py-1.5 text-sm font-semibold text-brand-400 hover:bg-brand-500/25 transition"
              >
                + Upload song
              </Link>
            </div>
            {user.songs.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-[#141414] p-10 text-center text-white/40">
                <p className="mb-2 text-4xl">🎙️</p>
                <p className="font-semibold">No songs uploaded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                    <tr>
                      <th className="px-5 py-3.5 text-left">Title</th>
                      <th className="px-5 py-3.5 text-left">AI Score</th>
                      <th className="px-5 py-3.5 text-left">Price</th>
                      <th className="px-5 py-3.5 text-left">Rev share</th>
                      <th className="px-5 py-3.5 text-left">Sold</th>
                      <th className="px-5 py-3.5 text-left">Streams</th>
                      <th className="px-5 py-3.5 text-left">W/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.songs.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-white/5 transition hover:bg-white/3"
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/track/${s.id}`}
                            className="font-semibold text-brand-400 hover:underline"
                          >
                            {s.title}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`font-bold ${s.aiScore >= 80 ? "text-gold-400" : s.aiScore >= 50 ? "text-brand-400" : "text-white/40"}`}>
                            {s.aiScore.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gold-400 font-semibold">
                          {formatPrice(s.licensePrice)}
                        </td>
                        <td className="px-5 py-3.5 text-accent-400">
                          {String(s.revenueSharePct)}%
                        </td>
                        <td className="px-5 py-3.5 text-white/60">
                          {s.soldLicenses}
                          <span className="text-white/25">/{s.totalLicenses}</span>
                        </td>
                        <td className="px-5 py-3.5 text-white/50">{s.streamCount}</td>
                        <td className="px-5 py-3.5">
                          <span className="text-green-400">{s.versusWins}W</span>
                          <span className="text-white/25">/</span>
                          <span className="text-red-400">{s.versusLosses}L</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── Artist: My Auctions ─────────────────────── */}
        {user.role !== "LISTENER" && user.auctionsCreated.length > 0 && (
          <section className="mb-12">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">🔨 My Auctions</h2>
              <Link
                href="/auctions"
                className="text-sm text-brand-400 hover:underline"
              >
                Browse all →
              </Link>
            </div>
            <div className="overflow-x-auto overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
              <table className="w-full text-sm">
                <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Song</th>
                    <th className="px-5 py-3.5 text-left">Status</th>
                    <th className="px-5 py-3.5 text-left">Current Bid</th>
                    <th className="px-5 py-3.5 text-left">Bids</th>
                    <th className="px-5 py-3.5 text-left">Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {user.auctionsCreated.map((a) => (
                    <tr key={a.id} className="border-b border-white/5 hover:bg-white/3 transition">
                      <td className="px-5 py-3.5">
                        <Link href={`/auctions/${a.id}`} className="font-semibold text-brand-400 hover:underline">
                          {a.song.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${a.status === "ACTIVE" ? "bg-green-500/15 text-green-400 border-green-500/25" : a.status === "SETTLED" ? "bg-brand-500/15 text-brand-400 border-brand-500/25" : "bg-white/8 text-white/40 border-white/10"}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gold-400 font-semibold">
                        {a.currentBid != null ? formatPrice(a.currentBid) : formatPrice(a.startingBid)}
                      </td>
                      <td className="px-5 py-3.5 text-white/60">{a._count.bids}</td>
                      <td className="px-5 py-3.5 text-white/40 text-xs">
                        {new Date(a.endsAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── My Bids ──────────────────────────────────── */}
        {user.auctionBids.length > 0 && (
          <section className="mb-12">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">🎯 My Bids</h2>
              <Link href="/auctions" className="text-sm text-brand-400 hover:underline">
                Browse all →
              </Link>
            </div>
            <div className="overflow-x-auto overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
              <table className="w-full text-sm">
                <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Auction</th>
                    <th className="px-5 py-3.5 text-left">Your Bid</th>
                    <th className="px-5 py-3.5 text-left">Current</th>
                    <th className="px-5 py-3.5 text-left">Status</th>
                    <th className="px-5 py-3.5 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {user.auctionBids.map((b) => {
                    const isLeading = b.auction.currentBid != null && Number(b.amount) >= Number(b.auction.currentBid);
                    return (
                      <tr key={b.id} className="border-b border-white/5 hover:bg-white/3 transition">
                        <td className="px-5 py-3.5">
                          <Link href={`/auctions/${b.auction.id}`} className="font-semibold text-brand-400 hover:underline">
                            {b.auction.song.title}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-gold-400 font-semibold">{formatPrice(b.amount)}</td>
                        <td className="px-5 py-3.5 text-white/60">
                          {b.auction.currentBid != null ? formatPrice(b.auction.currentBid) : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          {b.auction.status === "ACTIVE" ? (
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${isLeading ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-red-500/15 text-red-400 border-red-500/25"}`}>
                              {isLeading ? "Leading" : "Outbid"}
                            </span>
                          ) : (
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold bg-white/8 text-white/40 border border-white/10">
                              {b.auction.status}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-white/40 text-xs">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Badges showcase ─────────────────────────── */}
        <section className="mb-12">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold">🏅 Badges</h2>
            <span className="text-sm text-white/35">
              {user.badges.length} earned
            </span>
          </div>
          {user.badges.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#141414] p-6 text-center text-white/30 text-sm">
              No badges yet — invite friends, win battles, and sell licenses to earn them!
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {user.badges.map((b) => {
                const meta = BADGE_META[b.type as keyof typeof BADGE_META];
                return (
                  <div key={b.id} className={`flex items-center gap-4 rounded-2xl border p-4 ${meta.color}`}>
                    <span className="text-2xl flex-shrink-0">{meta.icon}</span>
                    <div>
                      <p className="font-bold text-sm">{meta.label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{meta.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Invite Engine widget ─────────────────────── */}
        <section className="mb-12">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold">🔗 Invite Friends</h2>
            <Link href="/invite" className="text-sm text-brand-400 hover:underline">
              View full invite page →
            </Link>
          </div>
          {inviteData ? (
            <div className="rounded-2xl border border-white/8 bg-[#141414] p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-3">
                Your invite code
              </p>
              <div className="flex items-center gap-3 mb-5">
                <code className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-mono text-brand-300">
                  {`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/signup?invite=${inviteData.code}`}
                </code>
                <Link
                  href="/invite"
                  className="flex-shrink-0 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 transition"
                >
                  Copy & Share
                </Link>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-white/40">
                  <span>{inviteData.usedCount} friends joined</span>
                  <span>
                    {inviteData.usedCount < 5 ? `${5 - inviteData.usedCount} to go` :
                     inviteData.usedCount < 10 ? `${10 - inviteData.usedCount} to go` :
                     inviteData.usedCount < 50 ? `${50 - inviteData.usedCount} to go` : "All milestones done! 🎉"}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500"
                    style={{
                      width: `${inviteData.usedCount < 5
                        ? (inviteData.usedCount / 5) * 100
                        : inviteData.usedCount < 10
                        ? ((inviteData.usedCount - 5) / 5) * 100
                        : inviteData.usedCount < 50
                        ? ((inviteData.usedCount - 10) / 40) * 100
                        : 100}%`
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-[#141414] p-6 text-center text-sm text-white/30">
              Your invite link will appear here after signing in.
            </div>
          )}
        </section>

        {/* ── Artist: Earnings breakdown ───────────────── */}
        {isArtist && user.songs.length > 0 && (
          <section className="mb-12">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">💰 Earnings</h2>
              <span className="text-sm text-white/35">
                {formatPrice(artistEarnings)} total
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
              <table className="w-full text-sm">
                <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Song</th>
                    <th className="px-5 py-3.5 text-left">Licenses sold</th>
                    <th className="px-5 py-3.5 text-left">Price</th>
                    <th className="px-5 py-3.5 text-left">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {user.songs.map((s) => {
                    const revenue = Number(s.licensePrice) * s.soldLicenses;
                    return (
                      <tr key={s.id} className="border-b border-white/5 transition hover:bg-white/3">
                        <td className="px-5 py-3.5">
                          <Link href={`/track/${s.id}`} className="font-semibold text-brand-400 hover:underline">
                            {s.title}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-white/60">
                          {s.soldLicenses} / {s.totalLicenses}
                        </td>
                        <td className="px-5 py-3.5 text-white/60">
                          {formatPrice(s.licensePrice)}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-gold-400">
                          {formatPrice(revenue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-white/8 bg-white/3">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-white/35">
                      Total
                    </td>
                    <td className="px-5 py-3 font-bold text-gold-400">
                      {formatPrice(artistEarnings)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* ── Transaction history ──────────────────────── */}
        <section>
          <h2 className="mb-5 text-xl font-bold">Transaction History</h2>
          {user.transactions.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#141414] p-8 text-center text-white/35 text-sm">
              No transactions yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
              <table className="w-full text-sm">
                <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Type</th>
                    <th className="px-5 py-3.5 text-left">Amount</th>
                    <th className="px-5 py-3.5 text-left">Status</th>
                    <th className="px-5 py-3.5 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {user.transactions.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-white/5 transition hover:bg-white/3"
                    >
                      <td className="px-5 py-3.5 text-white/60">
                        {t.type.replace(/_/g, " ")}
                      </td>
                      <td className="px-5 py-3.5 text-gold-400 font-semibold">
                        {formatPrice(t.amount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            t.status === "SUCCEEDED"
                              ? "bg-green-500/15 text-green-400 border border-green-500/25"
                              : t.status === "PENDING"
                              ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25"
                              : "bg-red-500/15 text-red-400 border border-red-500/25"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-white/40 text-xs">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

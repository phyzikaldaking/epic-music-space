import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import ArtistWelcomeBanner from "@/components/ArtistWelcomeBanner";
import NextPayoutWidget from "@/components/NextPayoutWidget";
import ProviderDashboardCard from "@/components/ProviderDashboardCard";
import ContinueListeningRail from "@/components/ContinueListeningRail";
import ResendVerificationButton from "@/components/ResendVerificationButton";
import DashboardTimingBeacon from "@/components/DashboardTimingBeacon";
import ProducerInsights from "@/components/ProducerInsights";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your licenses, transactions, tracks, and auction activity on Epic Music Space.",
};
import { redirect } from "next/navigation";
import { formatPrice } from "@ems/utils";
import { BADGE_META } from "@/lib/badges";
import { getSiteUrl } from "@/lib/site";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");
  const siteUrl = getSiteUrl();

  const userId = session.user.id;

  // Fan out: split the previous single-query waterfall into parallel reads.
  // Each section renders from its own query so a slow row doesn't block the
  // others, and the executor can hit the DB connection pool concurrently.
  const [
    userRow,
    licenses,
    transactions,
    songs,
    badges,
    auctionsCreated,
    auctionBids,
    invite,
    inviteUsedCount,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { studio: { select: { username: true, bio: true } } },
    }),
    prisma.licenseToken.findMany({
      where: { holderId: userId },
      include: { song: true },
      orderBy: { purchasedAt: "desc" },
      take: 10,
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.song.findMany({
      where: { artistId: userId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { _count: { select: { versusMatchesA: true, versusMatchesB: true } } },
    }),
    prisma.userBadge.findMany({
      where: { userId },
      orderBy: { awardedAt: "desc" },
    }),
    prisma.auction.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        song: { select: { id: true, title: true } },
        _count: { select: { bids: true } },
      },
    }),
    prisma.auctionBid.findMany({
      where: { bidderId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        auction: {
          include: { song: { select: { id: true, title: true } } },
        },
      },
    }),
    prisma.inviteCode.findFirst({
      where: { createdById: userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.inviteCode.count({
      where: { createdById: userId, usedById: { not: null } },
    }),
  ]);

  if (!userRow) redirect("/auth/signin");

  // ── "Since you last visited" summary ─────────────────────────────────
  // Captures the timestamp of the previous load BEFORE we update it, then
  // computes how much activity landed in that window. If lastSeenAt is
  // null (fresh account or first dashboard hit) we fall back to the past
  // 7 days so the card has something to show. We do this best-effort —
  // nothing here blocks the dashboard render if the bump fails.
  const previousVisit = userRow.lastSeenAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const wasFirstVisit = !userRow.lastSeenAt;
  void prisma.user
    .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {
      /* ignore — purely cosmetic */
    });

  const songIdsForUser = await prisma.song.findMany({
    where: { artistId: userId },
    select: { id: true },
  }).then((rows) => rows.map((r) => r.id));

  const [
    sinceLastVisitFollowers,
    sinceLastVisitLicenseSales,
    sinceLastVisitTipUsd,
    sinceLastVisitNewLikes,
    sinceLastVisitNewComments,
  ] = await Promise.all([
    prisma.userFollow.count({
      where: { followingId: userId, createdAt: { gt: previousVisit } },
    }),
    songIdsForUser.length
      ? prisma.licenseToken.count({
          where: {
            songId: { in: songIdsForUser },
            purchasedAt: { gt: previousVisit },
            status: "ACTIVE",
          },
        })
      : Promise.resolve(0),
    prisma.transaction
      .aggregate({
        where: {
          userId,
          type: "TIP",
          status: "SUCCEEDED",
          createdAt: { gt: previousVisit },
        },
        _sum: { amount: true },
      })
      .then((r) => Number(r._sum?.amount ?? 0))
      .catch(() => 0),
    songIdsForUser.length
      ? prisma.postLike.count({
          where: {
            createdAt: { gt: previousVisit },
            post: { authorId: userId },
          },
        }).catch(() => 0)
      : Promise.resolve(0),
    prisma.postComment.count({
      where: {
        createdAt: { gt: previousVisit },
        post: { authorId: userId },
        NOT: { authorId: userId },
      },
    }).catch(() => 0),
  ]);

  const sinceLastVisitTotal =
    sinceLastVisitFollowers +
    sinceLastVisitLicenseSales +
    sinceLastVisitNewLikes +
    sinceLastVisitNewComments +
    (sinceLastVisitTipUsd > 0 ? 1 : 0);

  // Provider stats — only fetched for PRODUCER / ENGINEER / LABEL.
  const isProvider = userRow.role === "PRODUCER" || userRow.role === "ENGINEER" || userRow.role === "LABEL";
  const providerStats = isProvider
    ? await (async () => {
        const [listingsCount, ordersInProgress, ordersDelivered, grossAgg] = await Promise.all([
          prisma.serviceListing.count({
            where: { providerId: userId, status: "LIVE" },
          }),
          prisma.serviceOrder.count({
            where: { providerId: userId, status: { in: ["PAID", "IN_PROGRESS", "REVISION_REQUESTED"] } },
          }),
          prisma.serviceOrder.count({
            where: { providerId: userId, status: { in: ["DELIVERED", "COMPLETED"] } },
          }),
          prisma.serviceOrder.aggregate({
            where: { providerId: userId, status: "COMPLETED" },
            _sum: { priceUsd: true },
          }),
        ]);
        return {
          listingsCount,
          ordersInProgress,
          ordersDelivered,
          grossLifetime: Number(grossAgg._sum.priceUsd ?? 0),
        };
      })()
    : null;

  // Re-stitch the shape downstream code expects.
  const user = {
    ...userRow,
    licenses,
    transactions,
    songs,
    badges,
    auctionsCreated,
    auctionBids,
  };

  const inviteData = invite ? { code: invite.code, usedCount: inviteUsedCount } : null;

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

  const trialDaysLeft =
    user.subscriptionTier === "TRIAL" && user.trialExpiresAt
      ? Math.max(0, Math.ceil((user.trialExpiresAt.getTime() - Date.now()) / 86_400_000))
      : null;

  const nextStep = (() => {
    if (isArtist && !user.studio) {
      return {
        label: "Claim studio username",
        href: "/profile/edit",
        body: "Make your public handle discoverable.",
        icon: "🏷️",
      };
    }

    if (isArtist && user.songs.length === 0) {
      return {
        label: "Upload first track",
        href: "/studio/new",
        body: "Get a release live in minutes.",
        icon: "⚡",
      };
    }

    if (isArtist && !connectStatus.onboardingComplete) {
      return {
        label: "Finish payouts",
        href: "/dashboard/payouts",
        body: "Activate Stripe so you can get paid.",
        icon: "💳",
      };
    }

    if (isProvider && providerStats && providerStats.listingsCount === 0) {
      return {
        label: "Create storefront",
        href: "/services/new",
        body: "List your first service.",
        icon: "🧰",
      };
    }

    if (user.role === "LISTENER") {
      return {
        label: "Browse marketplace",
        href: "/marketplace",
        body: "Find something worth playing next.",
        icon: "🎧",
      };
    }

    return {
      label: "Open studio",
      href: "/studio",
      body: "Jump back into your control room.",
      icon: "🎛️",
    };
  })();

  const quickActions = [
    {
      label: nextStep.label,
      href: nextStep.href,
      body: nextStep.body,
      icon: nextStep.icon,
      primary: true,
    },
    {
      label: "Continue listening",
      href: "/marketplace",
      body: "Pick up where you left off.",
      icon: "▶",
    },
    {
      label: isArtist ? "Upload track" : user.role === "LISTENER" ? "Saved items" : "Manage services",
      href: isArtist ? "/studio/new" : user.role === "LISTENER" ? "/dashboard/saved" : "/dashboard/services",
      body: isArtist ? "Open the quick publish flow." : user.role === "LISTENER" ? "Return to your saved work." : "Adjust your storefront.",
      icon: isArtist ? "⚡" : user.role === "LISTENER" ? "🔖" : "🧾",
    },
    {
      label: isProvider ? "Services dashboard" : "Battles",
      href: isProvider ? "/dashboard/services" : "/versus",
      body: isProvider ? "Track orders and listings." : "See what is trending now.",
      icon: isProvider ? "🧰" : "⚔️",
    },
  ];

  const dashboardSummary = [
    {
      label: "Role",
      value: user.role.replace("_", " "),
    },
    {
      label: "Studio",
      value: user.studio?.username ? `@${user.studio.username}` : "Not set",
    },
    {
      label: "Payouts",
      value: isArtist
        ? connectStatus.onboardingComplete
          ? "Ready"
          : connectStatus.connected
            ? "Finish setup"
            : "Not connected"
        : "Not required",
    },
    {
      label: "Since last visit",
      value: wasFirstVisit ? "First time" : `${sinceLastVisitTotal} changes`,
    },
  ];

  const topSong = user.songs.length > 0
    ? [...user.songs].sort((a, b) => b.soldLicenses - a.soldLicenses || b.streamCount - a.streamCount)[0]
    : null;

  const insightCards = [
    {
      label: "Momentum",
      value: wasFirstVisit ? "Fresh start" : `${sinceLastVisitTotal} changes`,
      detail: !wasFirstVisit && sinceLastVisitTotal > 0
        ? `${sinceLastVisitFollowers} new followers, ${sinceLastVisitLicenseSales} sales${sinceLastVisitTipUsd > 0 ? `, $${sinceLastVisitTipUsd.toFixed(2)} in tips` : ""}.`
        : "We’ll summarize what moved while you were away.",
      tone: "brand",
    },
    {
      label: "Engagement",
      value: user.role === "LISTENER" ? `${user.licenses.length} licenses` : `${totalSongsSold} sold`,
      detail: user.role === "LISTENER"
        ? `You’ve collected ${user.licenses.length} active license${user.licenses.length === 1 ? "" : "s"}.`
        : `Your catalog has ${user.songs.length} live track${user.songs.length === 1 ? "" : "s"}.`,
      tone: "gold",
    },
    {
      label: "Top performer",
      value: topSong ? topSong.title : "Nothing yet",
      detail: topSong
        ? `${topSong.soldLicenses} sold · ${topSong.streamCount} streams`
        : "Upload or promote one track to surface a leader.",
      tone: "accent",
    },
    {
      label: "Invite pull",
      value: inviteData ? `${inviteData.usedCount} claimed` : "Invite off",
      detail: inviteData
        ? `Code ${inviteData.code} has been used by ${inviteData.usedCount} account${inviteData.usedCount === 1 ? "" : "s"}.`
        : "Create an invite code to measure word-of-mouth.",
      tone: "white",
    },
  ];

  const unknownBadgeMeta = {
    label: "Unlocked Badge",
    icon: "🏅",
    description: "A newly unlocked platform badge.",
    color: "text-white border-white/15 bg-white/5",
  };

  return (
    <div className="studio-room relative min-h-screen">
      <div className="relative z-[1] mx-auto max-w-7xl px-4 py-10">
        <DashboardTimingBeacon />
        <section className="mb-8 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,15,24,0.96),rgba(11,18,25,0.94)_45%,rgba(26,14,31,0.9))] p-6 shadow-2xl shadow-black/35 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/75">
                Control Room
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
                {user.name ?? user.email ?? "Epic Music Space User"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62 sm:text-base">
                Your dashboard is the command center for the parts of the site that matter most:
                studio, marketplace, payouts, and the activity that happened while you were away.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {dashboardSummary.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-white/10 bg-white/4 px-3 py-2"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white/82">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:w-[380px]">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-300">
                  Next best step
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{nextStep.label}</p>
                <p className="mt-1 text-sm leading-6 text-white/55">{nextStep.body}</p>
                <Link
                  href={nextStep.href}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand-600"
                >
                  {nextStep.icon} Open →
                </Link>
              </div>
              <div className="grid gap-2">
                <Link
                  href={user.role !== "LISTENER" ? "/studio/new" : "/marketplace"}
                  className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/8"
                >
                  {user.role !== "LISTENER" ? "Open quick upload →" : "Browse the catalog →"}
                </Link>
                <Link
                  href={isArtist ? "/dashboard/payouts" : "/dashboard/saved"}
                  className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/8"
                >
                  {isArtist ? "Review payouts →" : "Open saved items →"}
                </Link>
                <Link
                  href={isProvider ? "/dashboard/services" : "/versus"}
                  className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/8"
                >
                  {isProvider ? "Manage services →" : "Jump to battles →"}
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
                  action.primary
                    ? "border-brand-500/35 bg-brand-500/10 shadow-lg shadow-brand-500/10"
                    : "border-white/10 bg-white/4 hover:bg-white/7"
                }`}
              >
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/42">
                  {action.icon} {action.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/60">{action.body}</p>
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-tube-300">
                  Open →
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Trial expiry banner ──────────────────────── */}
        {trialDaysLeft !== null && trialDaysLeft > 0 && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-brand-500/30 bg-brand-500/10 px-5 py-3.5">
            <p className="text-sm font-semibold text-brand-300">
              ⚡ Your free trial ends in{" "}
              <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}</strong> — upgrade to keep full access.
            </p>
            <Link
              href="/pricing"
              className="ml-4 flex-shrink-0 rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-brand-600"
            >
              Upgrade →
            </Link>
          </div>
        )}
        {trialDaysLeft === 0 && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3.5">
            <p className="text-sm font-semibold text-red-300">
              Your free trial has expired. Upgrade to restore Pro features.
            </p>
            <Link
              href="/pricing"
              className="ml-4 flex-shrink-0 rounded-lg bg-red-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-red-600"
            >
              Upgrade →
            </Link>
          </div>
        )}

        <section className="mb-8 grid gap-3 md:grid-cols-4">
          {insightCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-2xl border p-4 ${
                card.tone === "brand"
                  ? "border-brand-500/25 bg-brand-500/10"
                  : card.tone === "gold"
                    ? "border-gold-500/25 bg-gold-500/8"
                    : card.tone === "accent"
                      ? "border-accent-500/25 bg-accent-500/8"
                      : "border-white/10 bg-white/4"
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{card.label}</p>
              <p className="mt-2 truncate text-lg font-black text-white">{card.value}</p>
              <p className="mt-1 text-xs leading-5 text-white/55">{card.detail}</p>
            </div>
          ))}
        </section>

        {/* ── Header ──────────────────────────────────── */}
        <div className="mb-10 flex flex-col gap-6 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 border-l-2 border-accent-400 pl-3 text-xs font-black uppercase tracking-[0.24em] text-accent-300">
              Workspace
            </p>
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              Your activity feed, receipts, and creator tools
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Everything below is organized around the things a returning user usually needs first:
              what changed, what is pending, and where to go next.
            </p>
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
          <div className="flex flex-wrap gap-3">
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="inline-flex h-11 items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 px-5 text-sm font-black text-red-400 transition hover:bg-red-500/20"
              >
                Owner Portal
              </Link>
            )}
            {user.role !== "LISTENER" && (
              <Link
                href="/studio/new"
                className="inline-flex h-11 items-center justify-center rounded-md bg-white px-5 text-sm font-black text-[#050509] transition hover:bg-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Upload song
              </Link>
            )}
            <Link
              href="/versus"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-accent-500/40 bg-accent-500/10 px-5 text-sm font-black text-accent-300 transition hover:bg-accent-500/20"
            >
              ⚔️ Battles
            </Link>
          </div>
        </div>

        {/* ── Continue listening (where you left off) ───────────────────── */}
        <ContinueListeningRail />

        {/* ── First-time artist welcome checklist ───────────────────────── */}
        {isArtist && (
          <ArtistWelcomeBanner
            hasUploadedSong={user.songs.length > 0}
            hasStudio={!!user.studio}
            payoutsReady={connectStatus.onboardingComplete}
          />
        )}

        {/* ── Producer / Engineer / Label storefront card ────────────────── */}
        {isProvider && providerStats && (
          <ProviderDashboardCard
            role={user.role as "PRODUCER" | "ENGINEER" | "LABEL"}
            listingsCount={providerStats.listingsCount}
            ordersInProgress={providerStats.ordersInProgress}
            ordersDelivered={providerStats.ordersDelivered}
            grossLifetime={providerStats.grossLifetime}
          />
        )}

        {/* ── Next payout widget (artists with at least one sale) ───────── */}
        {isArtist && totalSongsSold > 0 && (
          <div className="mb-8">
            <NextPayoutWidget
              pendingDollars={artistEarnings}
              payoutsReady={connectStatus.onboardingComplete}
            />
          </div>
        )}

        {/* ── "Since you last visited" summary ────────────────────────────
            The come-back hook — first thing an artist sees on a fresh load
            is what changed since their last session. Hidden on the first
            visit (nothing to compare against) and when there's literally
            nothing new (silence is louder than zeros). */}
        {!wasFirstVisit && sinceLastVisitTotal > 0 && (
          <div className="mb-8 rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/8 to-accent-500/4 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
              Since you last visited
            </p>
            <p className="mt-1 text-base font-bold text-white/90">
              {previousVisit.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              → now
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {sinceLastVisitFollowers > 0 && (
                <li className="rounded-xl border border-white/10 bg-white/4 p-3">
                  <p className="text-2xl font-extrabold text-cyan-300">+{sinceLastVisitFollowers}</p>
                  <p className="text-[11px] uppercase tracking-widest text-white/45">
                    {sinceLastVisitFollowers === 1 ? "follower" : "followers"}
                  </p>
                </li>
              )}
              {sinceLastVisitLicenseSales > 0 && (
                <li className="rounded-xl border border-white/10 bg-white/4 p-3">
                  <p className="text-2xl font-extrabold text-emerald-300">+{sinceLastVisitLicenseSales}</p>
                  <p className="text-[11px] uppercase tracking-widest text-white/45">
                    {sinceLastVisitLicenseSales === 1 ? "license sale" : "license sales"}
                  </p>
                </li>
              )}
              {sinceLastVisitTipUsd > 0 && (
                <li className="rounded-xl border border-white/10 bg-white/4 p-3">
                  <p className="text-2xl font-extrabold text-pink-300">${sinceLastVisitTipUsd.toFixed(2)}</p>
                  <p className="text-[11px] uppercase tracking-widest text-white/45">in tips</p>
                </li>
              )}
              {sinceLastVisitNewLikes > 0 && (
                <li className="rounded-xl border border-white/10 bg-white/4 p-3">
                  <p className="text-2xl font-extrabold text-rose-300">+{sinceLastVisitNewLikes}</p>
                  <p className="text-[11px] uppercase tracking-widest text-white/45">
                    {sinceLastVisitNewLikes === 1 ? "like" : "likes"}
                  </p>
                </li>
              )}
              {sinceLastVisitNewComments > 0 && (
                <li className="rounded-xl border border-white/10 bg-white/4 p-3">
                  <p className="text-2xl font-extrabold text-amber-300">+{sinceLastVisitNewComments}</p>
                  <p className="text-[11px] uppercase tracking-widest text-white/45">
                    {sinceLastVisitNewComments === 1 ? "comment" : "comments"}
                  </p>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* ── Email verification reminder ─────────────────────────────────
            Required for receipts, license downloads, and payouts. Hidden
            once the user clicks the link in their welcome email. */}
        {!user.emailVerified && (
          <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-yellow-500/35 bg-yellow-500/8 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-bold text-yellow-200">Verify your email</p>
              <p className="mt-0.5 text-xs text-yellow-100/65">
                We sent a verification link to <strong>{user.email}</strong>. License receipts and
                payout-related emails won&apos;t reach you until it&apos;s confirmed.
              </p>
            </div>
            <div className="flex-shrink-0">
              <ResendVerificationButton email={user.email ?? ""} />
            </div>
          </div>
        )}

        {/* ── Profile completeness checklist (artists) ──────────────────── */}
        {isArtist && (() => {
          const items = [
            {
              key: "avatar",
              label: "Add a profile photo",
              done: !!user.image,
              href: "/profile/edit",
            },
            {
              key: "studio",
              label: "Claim your studio username",
              done: !!user.studio,
              href: "/profile/edit",
            },
            {
              key: "bio",
              label: "Write a bio so fans know your sound",
              done: !!user.studio?.bio && user.studio.bio.trim().length > 0,
              href: "/studio/setup",
            },
            {
              key: "track",
              label: "Upload your first track",
              done: user.songs.length > 0,
              href: "/studio/new",
            },
            {
              key: "payouts",
              label: "Connect Stripe to receive payouts",
              done: connectStatus.onboardingComplete,
              href: "/dashboard/payouts",
            },
          ];
          const doneCount = items.filter((i) => i.done).length;
          const allDone = doneCount === items.length;
          if (allDone) return null;
          const pct = Math.round((doneCount / items.length) * 100);
          return (
            <div className="mb-8 rounded-2xl border border-white/10 bg-[#141420] p-5">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
                    Profile setup
                  </p>
                  <p className="mt-0.5 text-base font-bold">
                    {doneCount} of {items.length} steps complete
                  </p>
                </div>
                <span className="text-sm font-semibold text-white/55">{pct}%</span>
              </div>
              <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                <progress
                  max={100}
                  value={pct}
                  className="ems-progress ems-progress-brand h-1.5 w-full"
                  aria-label="Profile completion"
                />
              </div>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.key}>
                    {item.done ? (
                      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-white/45">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20 text-[11px] text-green-300">✓</span>
                        <span className="line-through">{item.label}</span>
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-white/85 transition hover:bg-white/5"
                      >
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-[11px] text-white/35" />
                        <span>{item.label}</span>
                        <span className="ml-auto text-xs text-brand-400">→</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

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

        {/* ── Pro profile prompt (engineers / producers) ─── */}
        {(user.role === "ENGINEER" || user.role === "PRODUCER") && (
          <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/8 to-fuchsia-500/6 px-5 py-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-bold text-amber-200">
                Build your cinematic pro profile
              </p>
              <p className="text-sm text-white/65 mt-0.5">
                Show off your Grammy nominations, RIAA certifications, gear, and the records
                you&apos;ve worked on. This is what artists see before they hire you.
              </p>
            </div>
            <Link
              href="/pro/edit"
              className="flex-shrink-0 rounded-xl bg-gradient-to-r from-amber-400 to-fuchsia-500 px-5 py-2.5 text-sm font-extrabold text-black transition hover:opacity-90"
            >
              Edit pro profile →
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
                  : "Connect Stripe to receive your share of every license sale directly to your bank account (100% allocated to you, less the flat 10% platform fee — itemized on every payout)."}
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
                Every license sale is allocated 100% to you and pays out via
                Stripe automatically — flat 10% platform fee itemized on every
                payout receipt.
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
            <div className="rounded-2xl border border-white/8 studio-faceplate p-10 text-center">
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
            <div className="overflow-x-auto rounded-2xl border border-white/8 studio-faceplate">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Song</th>
                    <th className="px-5 py-3.5 text-left">License #</th>
                    <th className="px-5 py-3.5 text-left">Price paid</th>
                    <th className="px-5 py-3.5 text-left">Status</th>
                    <th className="px-5 py-3.5 text-left">Purchased</th>
                    <th className="px-5 py-3.5 text-left">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {user.licenses.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-white/5 transition hover:bg-white/3"
                    >
                      <td className="px-5 py-3.5">
                        {l.song ? (
                          <>
                            <Link
                              href={`/track/${l.song.id}`}
                              className="font-semibold text-brand-400 hover:underline"
                            >
                              {l.song.title}
                            </Link>
                            <div className="text-xs text-white/35">{l.song.artist}</div>
                          </>
                        ) : (
                          <div className="text-xs text-white/40">Track unavailable</div>
                        )}
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
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/licenses/${l.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10"
                          >
                            Receipt
                          </Link>
                          {l.song?.hasStems && (
                            <a
                              href={`/api/licenses/${l.id}/download`}
                              className="inline-flex items-center gap-1 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-400 transition hover:bg-brand-500/20"
                            >
                              ↓ Trackout
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Producer Insights (funnel + top performer + stalled) ──── */}
        {user.role !== "LISTENER" && user.songs.length > 0 && (
          <ProducerInsights artistId={userId} />
        )}

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
              <div className="rounded-2xl border border-white/8 studio-faceplate p-10 text-center">
                <p className="mb-3 text-4xl">🎙️</p>
                <p className="text-lg font-semibold text-white/85">
                  Upload your first track to start earning
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-white/45">
                  Set a license price and revenue share — fans license your
                  track on the marketplace and you get paid out via Stripe.
                  Stats appear here once a track is live.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Link
                    href="/studio/new"
                    className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
                  >
                    + Upload your first song
                  </Link>
                  <Link
                    href="/marketplace"
                    className="rounded-xl border border-white/12 px-5 py-2.5 text-sm font-bold text-white/75 hover:bg-white/5"
                  >
                    See examples
                  </Link>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-hidden rounded-2xl border border-white/8 studio-faceplate">
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
            <div className="overflow-x-auto overflow-hidden rounded-2xl border border-white/8 studio-faceplate">
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
                        {a.song ? (
                          <Link href={`/auctions/${a.id}`} className="font-semibold text-brand-400 hover:underline">
                            {a.song.title}
                          </Link>
                        ) : (
                          <span className="text-white/40">Track unavailable</span>
                        )}
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
            <div className="overflow-x-auto overflow-hidden rounded-2xl border border-white/8 studio-faceplate">
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
                          {b.auction.song ? (
                            <Link href={`/auctions/${b.auction.id}`} className="font-semibold text-brand-400 hover:underline">
                              {b.auction.song.title}
                            </Link>
                          ) : (
                            <span className="text-white/40">Track unavailable</span>
                          )}
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
            <div className="rounded-2xl border border-white/8 studio-faceplate p-6 text-center text-white/30 text-sm">
              No badges yet — invite friends, win battles, and sell licenses to earn them!
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {user.badges.map((b) => {
                const meta = BADGE_META[b.type as keyof typeof BADGE_META] ?? unknownBadgeMeta;
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
            <div className="rounded-2xl border border-white/8 studio-faceplate p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-3">
                Your invite code
              </p>
              <div className="flex items-center gap-3 mb-5">
                <code className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-mono text-brand-300">
                  {`${siteUrl}/auth/signup?invite=${inviteData.code}`}
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
                <progress
                  max={100}
                  value={inviteData.usedCount < 5
                    ? (inviteData.usedCount / 5) * 100
                    : inviteData.usedCount < 10
                    ? ((inviteData.usedCount - 5) / 5) * 100
                    : inviteData.usedCount < 50
                    ? ((inviteData.usedCount - 10) / 40) * 100
                    : 100}
                  className="ems-progress ems-progress-brand h-2 w-full"
                  aria-label="Invite milestone progress"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 studio-faceplate p-6 text-center text-sm text-white/30">
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
            <div className="overflow-hidden rounded-2xl border border-white/8 studio-faceplate">
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
            <div className="rounded-2xl border border-white/8 studio-faceplate p-8 text-center text-white/35 text-sm">
              No transactions yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/8 studio-faceplate">
              <table className="w-full min-w-[640px] text-sm">
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

import { cache, Suspense } from "react";
import Image from "next/image";
import AdSlot from "@/components/ads/AdSlot";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import AiScoreBar from "@/components/AiScoreBar";
import DistrictBadge from "@/components/DistrictBadge";
import SongCard from "@/components/SongCard";
import FollowButton from "@/components/FollowButton";
import TipArtistButton from "@/components/TipArtistButton";
import MessageButton from "@/components/MessageButton";
import CustomBeatRequestButton from "@/components/CustomBeatRequestButton";
import ReportUserButton from "@/components/ReportUserButton";
import PostCard from "@/components/PostCard";
import { BADGE_META } from "@/lib/badges";
import { tallyRounds } from "@/lib/verzuz";
import { moodFor } from "@/lib/songMood";
import { formatPrice } from "@ems/utils";
import ShareStudioButton from "@/components/studio/ShareStudioButton";
import CareerTipCard from "@/components/studio/CareerTipCard";
import PromoKitButton from "@/components/studio/PromoKitButton";
import MuxPlayer from "@mux/mux-player-react/lazy";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ username: string }>;
}

const getStudioByUsername = cache(async (username: string) =>
  prisma.studio.findUnique({
    where: { username },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          emailVerified: true,
          connectChargesEnabled: true,
          connectPayoutsEnabled: true,
          // Current catalog only — legacy tracks rendered in a separate
          // "Vault" section sourced via a parallel query below.
          songs: {
            where: { isActive: true, isLegacy: false },
            orderBy: { aiScore: "desc" },
            take: 20,
          },
          licenses: {
            where: { status: "ACTIVE" },
            include: { song: { select: { title: true, artist: true } } },
            take: 10,
          },
          ownedLabel: { select: { id: true, name: true, slug: true } },
          _count: { select: { followers: true, following: true, songs: true } },
          badges: { orderBy: { awardedAt: "asc" } },
          posts: {
            where: { isPublished: true },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              _count: { select: { likes: true, comments: true } },
            },
          },
          roomsHosted: {
            where: { recordings: { some: { status: "READY" } } },
            orderBy: { startedAt: "desc" },
            take: 8,
            select: {
              id: true,
              title: true,
              startedAt: true,
              recordings: {
                where: { status: "READY" },
                orderBy: { completedAt: "desc" },
                take: 1,
                select: { id: true, playbackUrl: true, durationSeconds: true, completedAt: true },
              },
            },
          },
        },
      },
    },
  }).catch(() => null),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const studio = await getStudioByUsername(username);
  if (!studio) return { title: "Studio Not Found" };

  const artistName = studio.user.name ?? username;
  const title = `${artistName}'s Studio — Epic Music Space`;
  const description = studio.bio
    ?? `Listen to and license music from ${artistName} on Epic Music Space. ${studio.user._count.songs} tracks available.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: studio.user.image ? [{ url: studio.user.image }] : [],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: studio.user.image ? [studio.user.image] : [],
    },
  };
}

export default async function StudioProfilePage({ params }: Props) {
  const { username } = await params;
  const [session, studio] = await Promise.all([
    auth(),
    getStudioByUsername(username),
  ]);

  if (!studio) notFound();

  const { user } = studio;
  const isOwner = session?.user?.id === user.id;

  // Legacy / vault catalog — fetched separately so the main catalog query
  // stays small and indexed by the (artistId, isLegacy) compound index.
  // The collector-wall query runs in the same parallel block because it's
  // a cheap aggregation (LicenseToken.holderId is indexed) and gives us
  // the data needed for the public Fan Collector Wall at the bottom of
  // the page.
  const [
    legacySongs,
    verzuzMatches,
    collectorRows,
    districtPeers,
    recentComments,
    serviceListings,
  ] = await Promise.all([
    prisma.song.findMany({
      where: { artistId: user.id, isActive: true, isLegacy: true },
      orderBy: [{ originalReleaseYear: "desc" }, { createdAt: "desc" }],
      take: 50,
    }).catch(() => [] as Awaited<ReturnType<typeof prisma.song.findMany>>),
    prisma.verzuzMatch.findMany({
      where: { OR: [{ artistAId: user.id }, { artistBId: user.id }] },
      orderBy: [{ status: "asc" }, { startsAt: "desc" }],
      take: 12,
      select: {
        id: true,
        status: true,
        startsAt: true,
        artistAId: true,
        artistAName: true,
        artistBName: true,
        theme: true,
        rounds: { select: { winner: true } },
      },
    }).catch(() => [] as Array<{
      id: string;
      status: string;
      startsAt: Date;
      artistAId: string;
      artistAName: string;
      artistBName: string;
      theme: string | null;
      rounds: { winner: string | null }[];
    }>),
    // Top fans = users with the most ACTIVE licenses on this artist's
    // catalog. groupBy aggregates LicenseToken rows joined through Song.
    // Limit to 12 so the wall renders as a compact grid without
    // pagination. Earliest supporter (lowest min purchasedAt across all
    // tokens) is computed in JS on this small set.
    prisma.licenseToken.findMany({
      where: {
        status: "ACTIVE",
        song: { artistId: user.id },
      },
      select: {
        purchasedAt: true,
        holder: {
          select: {
            id: true,
            name: true,
            image: true,
            studio: { select: { username: true } },
          },
        },
      },
      orderBy: { purchasedAt: "asc" },
      take: 200,
    }).catch(
      () =>
        [] as Array<{
          purchasedAt: Date;
          holder: {
            id: string;
            name: string | null;
            image: string | null;
            studio: { username: string } | null;
          };
        }>,
    ),
    // District peer list — every active studio in the same district,
    // ranked by Studio.level (the platform's merit-based activity
    // ladder). Caps at 500 to keep the round trip cheap; districts
    // beyond that cap fall back to "Top 500" wording. We only pull
    // level + id so it's a small read.
    prisma.studio.findMany({
      where: { district: studio.district },
      orderBy: [{ level: "desc" }, { createdAt: "asc" }],
      take: 500,
      select: { id: true, level: true },
    }).catch(() => [] as Array<{ id: string; level: number }>),
    // ServiceListings — what this artist sells beyond licenses
    // (mixing, mastering, beats, templates, sample packs, lessons).
    // Sorted by totalSold desc so the most-purchased offerings lead.
    // Capped at 9 to render a clean 3-column grid; "See all" footer
    // appears when there are more.
    // Recent track comments across the artist's catalog. Surfaced as a
    // "Fans are talking" preview so the studio shows engagement, not
    // just inventory. Cap at 8; the track page hosts the full thread.
    prisma.trackComment.findMany({
      where: { song: { artistId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: {
          select: {
            name: true,
            image: true,
            studio: { select: { username: true } },
          },
        },
        song: { select: { id: true, title: true } },
      },
    }).catch(
      () =>
        [] as Array<{
          id: string;
          body: string;
          createdAt: Date;
          author: {
            name: string | null;
            image: string | null;
            studio: { username: string } | null;
          };
          song: { id: string; title: string };
        }>,
    ),
    prisma.serviceListing.findMany({
      where: { providerId: user.id, status: "LIVE" },
      orderBy: [{ totalSold: "desc" }, { createdAt: "desc" }],
      take: 9,
      select: {
        id: true,
        kind: true,
        title: true,
        description: true,
        priceUsd: true,
        deliveryDays: true,
        coverUrl: true,
        rating: true,
        ratingCount: true,
        totalSold: true,
      },
    }).catch(
      () =>
        [] as Array<{
          id: string;
          kind: string;
          title: string;
          description: string;
          priceUsd: { toString(): string };
          deliveryDays: number;
          coverUrl: string | null;
          rating: number | null;
          ratingCount: number;
          totalSold: number;
        }>,
    ),
  ]);

  // Aggregate the collector rows into per-holder counts + first-buy
  // timestamps. Ordered by license count desc, ties broken by who
  // bought first (rewards both volume and early-supporter behavior).
  const collectorByHolder = new Map<
    string,
    {
      holder: (typeof collectorRows)[number]["holder"];
      count: number;
      firstAt: Date;
    }
  >();
  let earliestSupporter: {
    holder: (typeof collectorRows)[number]["holder"];
    purchasedAt: Date;
  } | null = null;
  for (const row of collectorRows) {
    const existing = collectorByHolder.get(row.holder.id);
    if (existing) {
      existing.count += 1;
      if (row.purchasedAt < existing.firstAt) existing.firstAt = row.purchasedAt;
    } else {
      collectorByHolder.set(row.holder.id, {
        holder: row.holder,
        count: 1,
        firstAt: row.purchasedAt,
      });
    }
    if (!earliestSupporter || row.purchasedAt < earliestSupporter.purchasedAt) {
      earliestSupporter = { holder: row.holder, purchasedAt: row.purchasedAt };
    }
  }
  const topCollectors = Array.from(collectorByHolder.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.firstAt.getTime() - b.firstAt.getTime();
    })
    .slice(0, 12);

  // District rank — this artist's position within their district peer
  // group. Peers are sorted by Studio.level desc (the platform's
  // merit ladder); ties broken by who joined the district first.
  // Position is 1-based for the human-readable "#N" output. When the
  // artist isn't in the top 500 peers we fall back to "Top 500" copy
  // so we don't render "#undefined".
  const districtPosition =
    districtPeers.findIndex((p) => p.id === studio.id) + 1;
  const districtSize = districtPeers.length;
  const districtRankLabel =
    districtPosition === 0
      ? `In Top ${districtSize}`
      : districtPosition <= 3
        ? `🏆 #${districtPosition} in district`
        : districtPosition <= 10
          ? `🔥 #${districtPosition} in district`
          : districtPosition <= 25
            ? `Top 25 in district`
            : `#${districtPosition} in district`;
  const districtLabel =
    studio.district === "DOWNTOWN_PRIME"
      ? "Downtown Prime"
      : studio.district === "LABEL_ROW"
        ? "Label Row"
        : "Indie Blocks";

  // Owner-only studio completion checklist + cover-art quality check
  // (#4 + #5). Each item is a one-line guarantee: name, whether it's
  // done, the visible label, and a fix URL (or null when the artist
  // can't act from the studio page yet). The cover-art line counts
  // tracks missing artwork — it's the single biggest conversion lift
  // per the onboarding research, so we surface its specific count
  // rather than a yes/no flag. The "first battle" line uses the
  // total-battles roll-up computed below; it'll show as pending while
  // we're still building totalBattles a few lines down, so the
  // checklist actually has to read those values after they exist.
  // Move the totalLicensesSold + battle counters above for that.
  const songsMissingCoverArt = user.songs.filter((s) => !s.coverUrl).length;
  const hasBio = (studio.bio?.trim().length ?? 0) >= 24;
  const hasBanner = Boolean(studio.bannerUrl);
  const hasFirstTrack = user.songs.length > 0;
  const hasStripeConnected =
    user.connectChargesEnabled && user.connectPayoutsEnabled;

  // Recently Sold Licenses — derived from the collector rows so we don't
  // run a second query. We sort `collectorRows` ascending in the query,
  // so the most recent row is the last one. 24h / 7d windows are the
  // industry-standard social-proof intervals (Soundbetter, BeatStars).
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
  const licensesLast24h = collectorRows.filter(
    (r) => now - r.purchasedAt.getTime() <= ONE_DAY_MS,
  ).length;
  const licensesLast7d = collectorRows.filter(
    (r) => now - r.purchasedAt.getTime() <= SEVEN_DAYS_MS,
  ).length;
  const lastLicenseRow =
    collectorRows.length > 0 ? collectorRows[collectorRows.length - 1] : null;
  function formatTimeAgo(date: Date): string {
    const diffMs = now - date.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.round(days / 30);
    return `${months} mo ago`;
  }

  // Pinned-announcement heuristic. Without a Post.isPinned column we
  // treat the artist's newest post as the pinned announcement when it's
  // fresh (≤14 days old). This is the right call for the artist-growth
  // moments the spec names (new release, next battle, license drop) —
  // they're inherently recent. Older posts fall back to the regular
  // Updates feed below. Replace this with a real isPinned column when
  // the next Prisma migration lands.
  const PINNED_FRESH_MS = 14 * ONE_DAY_MS;
  const newestPost = user.posts[0] ?? null;
  const pinnedPost =
    newestPost && now - newestPost.createdAt.getTime() <= PINNED_FRESH_MS
      ? newestPost
      : null;
  const remainingPosts = pinnedPost
    ? user.posts.filter((p) => p.id !== pinnedPost.id)
    : user.posts;

  // Intro video heuristic. Use the most recent ready Mux post the
  // artist has uploaded as the studio's "intro clip". The spec asks
  // for 15s; we don't truncate, but autoplay+muted gives the same
  // "feels alive on arrival" effect without dropping the artist's
  // longer video posts.
  const introVideoPost = user.posts.find(
    (p) => p.muxPlaybackId && p.videoStatus === "READY",
  ) ?? null;

  let verzuzWins = 0;
  let verzuzLosses = 0;
  let verzuzTies = 0;
  for (const m of verzuzMatches) {
    if (m.status !== "COMPLETED") continue;
    const score = tallyRounds(m.rounds);
    const userIsA = m.artistAId === user.id;
    if (score.aWins === score.bWins) verzuzTies++;
    else if ((score.aWins > score.bWins) === userIsA) verzuzWins++;
    else verzuzLosses++;
  }

  const follow =
    session?.user?.id && !isOwner
      ? await prisma.userFollow.findUnique({
          where: {
            followerId_followingId: {
              followerId: session.user.id,
              followingId: user.id,
            },
          },
        }).catch(() => null)
      : null;
  const isFollowing = !!follow;

  // Viewer's invite progress. The studio page is for an artist, but the
  // invite milestone CTA is for whoever is *viewing* it — anyone can
  // earn the INVITE_5/10/50 badges by referring new signups. We only
  // query when there's a signed-in viewer so anon page loads stay cheap.
  // Counts redeemed invites (usedById not null); raw codes created
  // without a redemption don't move the needle.
  const viewerInviteCount =
    session?.user?.id
      ? await prisma.inviteCode
          .count({
            where: { createdById: session.user.id, usedById: { not: null } },
          })
          .catch(() => 0)
      : 0;
  const INVITE_MILESTONES = [5, 10, 50];
  const nextMilestone = INVITE_MILESTONES.find((m) => m > viewerInviteCount) ?? null;

  const avgScore =
    user.songs.length > 0
      ? user.songs.reduce((s, x) => s + x.aiScore, 0) / user.songs.length
      : 0;

  // Average revenue share for the plain-language license explainer. We
  // pull the per-song revenueSharePct (Decimal) and unweight it — sync
  // buyers want to know "what do I get from this artist" in concrete
  // terms before they buy. Falls back to a sensible 10% headline when
  // the catalog is empty so the explainer copy never blanks out.
  const avgRevenueSharePct =
    user.songs.length > 0
      ? user.songs.reduce((s, x) => s + Number(x.revenueSharePct), 0) /
        user.songs.length
      : 10;

  // Trailing-30-day license revenue → next payout estimate (#4 ask).
  // We sum the actual sale prices that landed within the last 30 days
  // — that's the most honest signal for "what does the next payout
  // look like." Stripe Connect payouts are net of platform fees; we
  // surface the gross-from-licenses and label it as an estimate so
  // we don't promise an exact figure that won't match the dashboard.
  // Uses purchasedAt + price already on collectorRows so no second
  // query. collectorRows only carries holder + timestamp; we need
  // price too, so do a small dedicated aggregate query.
  const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;
  const recentLicenseAgg = await prisma.licenseToken
    .aggregate({
      where: {
        status: "ACTIVE",
        song: { artistId: user.id },
        purchasedAt: { gte: new Date(now - THIRTY_DAYS_MS) },
      },
      _sum: { price: true },
      _count: { _all: true },
    })
    .catch(() => ({
      _sum: { price: null } as { price: number | null | { toString(): string } },
      _count: { _all: 0 },
    }));
  const last30dRevenue = Number(recentLicenseAgg._sum.price ?? 0);
  const last30dCount = recentLicenseAgg._count._all;

  // Top 3 + headline track are the licensing money-makers. Songs are
  // already pulled `orderBy: aiScore desc` (see getStudioByUsername), so
  // the slice is the platform's ranked recommendation. The headline
  // track drives the above-the-fold "License This Track" CTA so visitors
  // don't have to scroll past stats/badges/posts to find the buy button.
  const topSongs = user.songs.slice(0, 3);
  const headlineSong = topSongs[0] ?? null;
  const restSongs = user.songs.slice(3);

  // Studio Level tier label. The studio.level integer is incremented by
  // activity milestones (uploads, licenses sold, battle wins) elsewhere
  // in the codebase. Tier text turns the number into a status read —
  // "Lv.12" alone doesn't tell a stranger the artist is a Veteran.
  function levelTier(level: number): { label: string; color: string } {
    if (level >= 30) return { label: "Master", color: "from-gold-300 to-amber-500" };
    if (level >= 15) return { label: "Veteran", color: "from-accent-300 to-brand-500" };
    if (level >= 6) return { label: "Rising", color: "from-cyan-300 to-accent-500" };
    if (level >= 2) return { label: "Apprentice", color: "from-white/70 to-white/40" };
    return { label: "Rookie", color: "from-white/40 to-white/20" };
  }
  const studioLevelTier = levelTier(studio.level);

  // Per-song Verzuz CTA target. Visitors get a prefilled challenge form
  // pointing at this artist + this song; owners don't see the button
  // (you can't battle yourself). The song param is forward-compatible
  // with a future setlist-seed flow; today the form ignores it.
  function buildVerzuzHrefFor(songId: string): string | undefined {
    if (isOwner) return undefined;
    return `/verzuz/challenge/new?opponent=${encodeURIComponent(username)}&song=${encodeURIComponent(songId)}`;
  }

  const totalLicensesSold = user.songs.reduce((s, x) => s + x.soldLicenses, 0);
  const battleWins = user.songs.reduce((s, x) => s + x.versusWins, 0);
  const battleLosses = user.songs.reduce((s, x) => s + x.versusLosses, 0);
  const totalBattles = battleWins + battleLosses;
  const battleWinRate = totalBattles > 0 ? Math.round((battleWins / totalBattles) * 100) : null;
  const isSeasonContender = totalBattles >= 12 && battleWins >= 8;
  const isDivisionLeaderCandidate = totalBattles >= 8 && (battleWinRate ?? 0) >= 65;

  // Owner-only checklist items. Each row carries done/total and a fix
  // URL. Items the platform can't measure yet (e.g. invite link
  // milestone progress) link to the right surface instead of marking
  // themselves complete. Order matches the recommended onboarding
  // sequence in the spec: identity → presentation → catalog → trust
  // → engagement.
  type ChecklistItem = {
    label: string;
    done: boolean;
    href: string | null;
    detail?: string;
  };
  const checklist: ChecklistItem[] = [
    {
      label: "Pick a username",
      done: Boolean(studio.username),
      href: "/profile/edit",
    },
    {
      label: "Write a bio",
      done: hasBio,
      href: "/profile/edit",
      detail: hasBio ? undefined : "Aim for 24+ characters",
    },
    {
      label: "Upload a banner",
      done: hasBanner,
      href: "/profile/edit",
    },
    {
      label: "Add your first track",
      done: hasFirstTrack,
      href: "/studio/new",
    },
    {
      label: "Cover art on every track",
      done: hasFirstTrack && songsMissingCoverArt === 0,
      href: "/studio/manage",
      detail:
        songsMissingCoverArt > 0
          ? `${songsMissingCoverArt} track${songsMissingCoverArt === 1 ? "" : "s"} missing artwork`
          : undefined,
    },
    {
      label: "Connect Stripe for payouts",
      done: hasStripeConnected,
      href: "/dashboard/payouts",
    },
    {
      label: "Start your first battle",
      done: totalBattles > 0,
      href: "/verzuz/new",
    },
    {
      label: "Share your invite link",
      done: viewerInviteCount >= 1,
      href: "/invite",
      detail:
        viewerInviteCount === 0
          ? "Earn the INVITE_5 badge"
          : `${viewerInviteCount} invited`,
    },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistTotal = checklist.length;
  const checklistPct = Math.round((checklistDone / checklistTotal) * 100);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Suspense><AdSlot location="STUDIO_SIDEBAR" className="mb-6" /></Suspense>
      {/* Banner — promoted to feel like a personal storefront, not a
          profile-page header strip. Taller on desktop, overlay treatment
          shows the artist name, district, and a quick stat band so the
          first scroll-second already reads as "this is XX's storefront."
          Falls back to the original brand gradient when bannerUrl is
          unset; the overlay still works on the gradient. */}
      <div className="relative mb-8 h-56 w-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-accent-600 to-brand-900 sm:h-72 md:h-80">
        {studio.bannerUrl && (
          <Image
            src={studio.bannerUrl}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            priority
          />
        )}
        {/* Vignette + bottom-fade keeps overlay text legible on any
            banner the artist uploads, including bright photo banners. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(124,92,255,0.25),transparent_55%)]" />

        {/* Storefront overlay band — sits at the bottom-left of the
            banner so the avatar (anchored below) overlaps naturally. */}
        <div className="absolute inset-x-6 bottom-5 flex flex-wrap items-end justify-between gap-4 sm:inset-x-8">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-white/65 drop-shadow">
              {districtLabel} · Studio Lv.{studio.level}
            </p>
            <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-wide text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] sm:text-4xl md:text-5xl">
              {user.name ?? username}
            </h1>
            <p className="mt-1 text-sm text-white/65 drop-shadow">
              @{studio.username}
              {districtSize > 1 && districtPosition > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-cyan-300/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan-100">
                  {districtRankLabel}
                </span>
              )}
            </p>
          </div>
          <div className="hidden items-center gap-3 text-right text-[11px] font-bold uppercase tracking-widest text-white/65 sm:flex">
            <span className="rounded-md border border-white/20 bg-black/40 px-2.5 py-1 backdrop-blur">
              {user._count.followers} fans
            </span>
            <span className="rounded-md border border-white/20 bg-black/40 px-2.5 py-1 backdrop-blur">
              {totalLicensesSold} licenses
            </span>
          </div>
        </div>
      </div>

      {/* Profile header */}
      <div className="-mt-16 flex items-end gap-5 px-4">
        <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border-4 border-[#0a0a0f] bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-3xl">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? ""}
              width={192}
              height={192}
              priority
              className="h-full w-full object-cover"
            />
          ) : (
            "🎤"
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 pb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold">{user.name ?? username}</h1>
            <DistrictBadge district={studio.district} size="sm" />
            {/* District rank — a single chip pulling status from the
                peer ranking we computed above. Links to the district
                landing on /marketplace so curious visitors can see who
                else lives in the scene. Forward-compatible: the
                marketplace doesn't honor ?district yet, but the URL
                shape is the place we'll land that filter. */}
            {districtSize > 1 && (
              <Link
                href={`/marketplace?district=${encodeURIComponent(studio.district)}`}
                title={`${districtRankLabel} · ${districtSize} artists in ${districtLabel}`}
                className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-black text-cyan-100 transition hover:bg-cyan-500/20"
              >
                {districtRankLabel}
              </Link>
            )}
            {/* Studio level badge — now reads as status, not a small grey
                chip. The gradient encodes tier (Rookie → Master) so a
                stranger sees "Veteran" before they read the number. */}
            <span
              title={`Studio level ${studio.level} · ${studioLevelTier.label} tier`}
              className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${studioLevelTier.color} px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-black shadow-sm`}
            >
              <span aria-hidden>▲</span>
              Lv.{studio.level} · {studioLevelTier.label}
            </span>
            {user.connectChargesEnabled && user.connectPayoutsEnabled ? (
              <span
                title="Identity + payouts verified via Stripe Connect"
                className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/12 px-2 py-0.5 text-[11px] font-bold text-sky-300"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l2.39 4.84 5.34.78-3.86 3.76.91 5.32L12 14.27l-4.78 2.43.91-5.32L4.27 7.62l5.34-.78z" />
                </svg>
                Verified
              </span>
            ) : user.emailVerified ? (
              <span
                title="Email verified — full identity verification pending"
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/55"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 16.2 4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4z" />
                </svg>
                Email verified
              </span>
            ) : null}
            {user.ownedLabel && (
              <a
                href={`/label/${user.ownedLabel.id}`}
                className="rounded-full bg-accent-500/20 px-2 py-0.5 text-xs font-medium text-accent-400 hover:bg-accent-500/40"
              >
                🏷️ {user.ownedLabel.name}
              </a>
            )}
          </div>
          <p className="text-sm text-white/50">@{studio.username}</p>
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span>{user._count.followers} followers</span>
            <span>{user._count.following} following</span>
            <span>{totalLicensesSold} licenses sold</span>
            {totalBattles > 0 && (
              <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-200">
                ⚔️ {battleWins}W-{battleLosses}L{battleWinRate !== null ? ` (${battleWinRate}%)` : ""}
              </span>
            )}
            {isSeasonContender && (
              <span className="rounded-full border border-emerald-400/35 bg-emerald-500/12 px-2 py-0.5 font-semibold text-emerald-200">
                🏁 Season contender
              </span>
            )}
            {!isSeasonContender && isDivisionLeaderCandidate && (
              <span className="rounded-full border border-amber-400/35 bg-amber-500/12 px-2 py-0.5 font-semibold text-amber-200">
                🏆 Division leader pace
              </span>
            )}
          </div>
          {/* Badges row */}
          {user.badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {user.badges.map((b) => {
                const meta = BADGE_META[b.type as keyof typeof BADGE_META];
                return (
                  <span
                    key={b.id}
                    title={meta.description}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}
                  >
                    {meta.icon} {meta.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Follow / Edit / Tip — preceded by the money-action CTA so
            visitors see "License This Track" before any auth gate or
            social-graph button. Visible to logged-out visitors too. */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {headlineSong && (
            <Link
              href={`/track/${headlineSong.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition hover:from-brand-400 hover:to-accent-400 hover:shadow-brand-400/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
              title={`License "${headlineSong.title}" from ${formatPrice(headlineSong.licensePrice.toString())}`}
            >
              <span aria-hidden>🔑</span>
              License top track
              <span className="hidden text-[11px] font-bold uppercase tracking-wider text-white/75 sm:inline">
                · {formatPrice(headlineSong.licensePrice.toString())}
              </span>
            </Link>
          )}
          {isOwner ? (
            <a
              href="/profile/edit"
              className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10 transition"
            >
              Edit Profile
            </a>
          ) : session ? (
            <>
              <FollowButton
                targetUserId={user.id}
                initiallyFollowing={isFollowing}
                initialFollowerCount={user._count.followers}
              />
              <TipArtistButton artistId={user.id} artistName={user.name ?? username} />
              <Link
                href={`/verzuz/challenge/new?opponent=${encodeURIComponent(username)}`}
                className="rounded-xl border border-rose-400/40 bg-rose-500/12 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
                title="Challenge this artist to a Verzuz"
              >
                🎤 Verzuz
              </Link>
              <MessageButton peerId={user.id} />
              {session.user.id !== user.id &&
                (user.role === "PRODUCER" ||
                  user.role === "ENGINEER" ||
                  user.role === "ARTIST" ||
                  user.role === "LABEL") && (
                  <CustomBeatRequestButton
                    peerId={user.id}
                    peerName={user.name ?? username}
                  />
                )}
              {session.user.id !== user.id && (
                <ReportUserButton
                  reportedUserId={user.id}
                  context={{ kind: "profile", id: user.id }}
                />
              )}
            </>
          ) : (
            <a
              href="/auth/signin"
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold hover:bg-brand-600 transition"
            >
              Follow
            </a>
          )}
        </div>
      </div>

      {/* Owner-only "Complete your studio" meter (#4 + #5). Lives at the
          top of the owner's own page so the next action is obvious every
          time they visit. Cover-art quality is folded in as one line —
          missing artwork is the highest-leverage fix, with a track count
          and a direct link to the manage screen so the artist can act
          without hunting. Hidden for visitors. */}
      {isOwner && checklistDone < checklistTotal && (
        <section className="mt-6 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/5 via-fuchsia-500/5 to-amber-400/5 p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">
                Complete your studio
              </p>
              <h2 className="mt-1 text-xl font-extrabold">
                {checklistDone}/{checklistTotal} done · {checklistPct}%
              </h2>
              <p className="mt-1 text-sm text-white/55">
                Studios with all items checked convert listeners ~3× better.
              </p>
            </div>
            <div className="w-full max-w-xs">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 via-fuchsia-400 to-emerald-400 transition-all"
                  style={{ width: `${checklistPct}%` }}
                />
              </div>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {checklist.map((item) => (
              <li
                key={item.label}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                  item.done
                    ? "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-50"
                    : "border-white/10 bg-white/[0.03] text-white/80 hover:border-amber-300/45 hover:bg-amber-300/5"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                      item.done
                        ? "bg-emerald-500/30 text-emerald-50"
                        : "bg-white/10 text-white/55"
                    }`}
                  >
                    {item.done ? "✓" : "○"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{item.label}</p>
                    {item.detail && (
                      <p
                        className={`text-[11px] ${
                          item.done ? "text-emerald-200/65" : "text-amber-200/75"
                        }`}
                      >
                        {item.detail}
                      </p>
                    )}
                  </div>
                </div>
                {!item.done && item.href && (
                  <Link
                    href={item.href}
                    className="shrink-0 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-400/20"
                  >
                    Fix →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* AI Career Tip — owner-only card sits below the completion
          meter so the artist gets a focused next-move every visit.
          Hidden for visitors; tips are cached daily server-side. */}
      {isOwner && <CareerTipCard />}

      {/* Owner studio tools — promo kit lives next to the career tip
          so the artist's owner-only actions are clustered. Renders
          only when the artist has at least one track to promote. */}
      {isOwner && user.songs.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-4">
          <span aria-hidden className="text-lg">
            🛠️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">
              Studio tools
            </p>
            <p className="text-[11px] text-white/55">
              Generate share-ready cover art, captions, and a 15-second clip
              for any of your tracks.
            </p>
          </div>
          <PromoKitButton
            songs={user.songs.map((s) => ({
              id: s.id,
              title: s.title,
              artist: s.artist,
              coverUrl: s.coverUrl,
              audioUrl: s.audioUrl,
              aiScore: s.aiScore,
            }))}
          />
        </div>
      )}

      {/* Bio */}
      {studio.bio && (
        <p className="mt-6 text-sm text-white/60 max-w-2xl">{studio.bio}</p>
      )}

      {/* Intro video / pinned clip — gives the studio a pulse before the
          first song plays. We surface the artist's most recent
          ready-to-stream Mux video post; it's the closest thing we have
          to a dedicated intro slot without adding a Studio column. The
          player auto-plays muted (browsers permit muted autoplay), with
          a real Mux thumbnail as the poster so search-engine crawlers
          still see a sensible preview. */}
      {introVideoPost && introVideoPost.muxPlaybackId && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/12 bg-black shadow-xl shadow-black/40">
          <div className="aspect-video w-full">
            <MuxPlayer
              streamType="on-demand"
              playbackId={introVideoPost.muxPlaybackId}
              poster={`https://image.mux.com/${introVideoPost.muxPlaybackId}/thumbnail.webp?width=1280&fit_mode=preserve&time=1`}
              autoPlay="muted"
              loop
              muted
              playsInline
              accentColor="#7c5cff"
              style={{ width: "100%", height: "100%" }}
              metadata={{
                video_title: `${user.name ?? username} intro clip`,
                viewer_user_id: session?.user?.id ?? undefined,
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-black/60 px-4 py-2 text-xs text-white/55">
            <span className="font-bold uppercase tracking-widest text-cyan-200">
              ◉ Live · Studio intro
            </span>
            <span className="text-[11px]">
              Tap to unmute
            </span>
          </div>
        </div>
      )}

      {/* Fighter Profile strip — makes the studio feel competitive at a
          glance. Studio Level (status), Battle Record (W-L + win rate),
          and a compact achievements row sit in one band between the bio
          and the licensing CTAs. Renders even when battle/badge data is
          empty — we still want Level visible. */}
      <section className="mt-8 grid gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-black/40 via-black/20 to-black/40 p-4 sm:grid-cols-3 sm:gap-5 sm:p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/40">
            Studio level
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold tabular-nums text-white">
              {studio.level}
            </span>
            <span
              className={`rounded-full bg-gradient-to-r ${studioLevelTier.color} px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-black`}
            >
              {studioLevelTier.label}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-white/45">
            Earned through uploads, licenses, and battle wins.
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-300/85">
            Battle record
          </p>
          {totalBattles === 0 ? (
            <>
              <p className="mt-1 font-mono text-3xl font-extrabold tabular-nums text-white/40">
                0-0
              </p>
              <p className="mt-1 text-[11px] text-white/45">
                No battles yet — challenge them to start the rivalry.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 font-mono text-3xl font-extrabold tabular-nums text-white">
                <span className="text-emerald-300">{battleWins}</span>
                <span className="text-white/30">-</span>
                <span className="text-rose-300">{battleLosses}</span>
                {battleWinRate !== null && (
                  <span className="ml-2 text-base font-bold text-white/55">
                    ({battleWinRate}%)
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-white/45">
                Verzuz {totalBattles} {totalBattles === 1 ? "battle" : "battles"}
                {isSeasonContender ? " · 🏁 Season contender" : ""}
                {!isSeasonContender && isDivisionLeaderCandidate
                  ? " · 🏆 Division leader pace"
                  : ""}
              </p>
            </>
          )}
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-300/85">
            Achievements
          </p>
          {user.badges.length === 0 ? (
            <p className="mt-2 text-[11px] text-white/45">
              No badges yet — early adopter, first license, top artist all unlock here.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.badges.slice(0, 6).map((b) => {
                const meta = BADGE_META[b.type as keyof typeof BADGE_META];
                if (!meta) return null;
                return (
                  <span
                    key={b.id}
                    title={meta.description}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.color}`}
                  >
                    <span aria-hidden>{meta.icon}</span>
                    {meta.label}
                  </span>
                );
              })}
              {user.badges.length > 6 && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-white/55">
                  +{user.badges.length - 6} more
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Plain-language license explainer — research says listeners
          hesitate because they don't understand the model. The copy
          uses the artist's *actual* average revenue-share % so it
          reads as a specific promise, not a generic disclosure. The
          link to /how-licenses-work covers the full agreement for
          anyone who wants more depth before clicking buy. */}
      {user.songs.length > 0 && !isOwner && (
        <section className="mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-500/[0.04] p-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-lg text-cyan-100"
            >
              💡
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200">
                How licensing works on EMS
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/85">
                You buy a license for a specific track and receive{" "}
                <span className="font-bold text-cyan-100">
                  ≈ {avgRevenueSharePct.toFixed(0)}% of streaming royalties
                </span>{" "}
                from that song going forward — for as long as the license is
                active. Licenses are contractual revenue participation, not
                equity or securities. The artist keeps the master and EMS
                takes a flat 10% platform fee, itemized on every payout.
              </p>
              <Link
                href="/how-licenses-work"
                className="mt-2 inline-block text-[11px] font-bold uppercase tracking-wider text-cyan-200 transition hover:text-cyan-100"
              >
                Read the full agreement →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Support this artist — plain-English bar that names the four
          actions visitors can take. The "Buy a license" CTA defaults to
          the top-ranked track; "Start a battle" prefills the challenge
          form; share + follow round out the loop. Visible to everyone,
          including signed-out visitors, because the share/license
          actions don't require auth. */}
      {!isOwner && (
        <section className="mt-6 rounded-2xl border border-brand-400/35 bg-gradient-to-r from-brand-500/10 via-accent-500/10 to-fuchsia-500/10 p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-brand-200">
                Support this artist
              </p>
              <p className="mt-1 text-sm text-white/65">
                Buy a license, start a battle, share this studio, or
                follow — every one of these matters.
              </p>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-white/35">
              Backed by {user._count.followers} {user._count.followers === 1 ? "fan" : "fans"}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {headlineSong ? (
              <Link
                href={`/track/${headlineSong.id}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition hover:from-brand-400 hover:to-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
              >
                <span aria-hidden>🔑</span>
                Buy a license
              </Link>
            ) : (
              <Link
                href={`/studio/${username}#full-catalog`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold text-white/70 hover:bg-white/10"
              >
                <span aria-hidden>🎧</span>
                Browse catalog
              </Link>
            )}
            <Link
              href={`/verzuz/challenge/new?opponent=${encodeURIComponent(username)}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-400/45 bg-rose-500/10 px-4 text-sm font-bold text-rose-100 transition hover:border-rose-400/70 hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <span aria-hidden>⚔️</span>
              Start a battle
            </Link>
            <Link
              href={`/marketplace?district=${encodeURIComponent(studio.district)}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/10 px-4 text-sm font-bold text-cyan-100 transition hover:border-cyan-400/70 hover:bg-cyan-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              title={`Browse ${districtLabel} — ${districtSize} artists in this district`}
            >
              <span aria-hidden>🏘️</span>
              Join {districtLabel}
            </Link>
            <ShareStudioButton
              shareUrl={`/studio/${username}`}
              artistName={user.name ?? username}
            />
            {session ? (
              <FollowButton
                targetUserId={user.id}
                initiallyFollowing={isFollowing}
                initialFollowerCount={user._count.followers}
              />
            ) : (
              <Link
                href={`/auth/signin?callbackUrl=${encodeURIComponent(`/studio/${username}`)}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-bold text-white transition hover:border-accent-300/45 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
              >
                <span aria-hidden>✨</span>
                Follow
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Book a live listening session — quick-mode entry point that
          forwards to /studio/live with an ?artist= param the live
          page can later honor as a host filter or auto-DM template.
          We don't add a new booking schema yet (that's its own
          feature); this is the fan-facing doorway into live
          engagement. Owners see a "Go live" variant pointing to
          their own live room. Hidden when the artist isn't accepting
          live engagement, but we don't have that flag yet, so it's
          unconditionally visible — same approach as the verzuz CTA. */}
      {!isOwner && (
        <section className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-rose-400/35 bg-gradient-to-r from-rose-500/[0.06] via-amber-500/[0.04] to-rose-500/[0.06] p-4">
          <span
            aria-hidden
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-lg text-rose-100"
          >
            🎙️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-200">
              Live listening session
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              Want a live unreleased preview, Q&amp;A, or feedback session?
            </p>
            <p className="text-[11px] text-white/55">
              Open the live room when {user.name ?? username} goes on air, or
              request one — fans license tracks in real time as they play.
            </p>
          </div>
          <Link
            href={`/studio/live?artist=${encodeURIComponent(username)}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-400/15 px-4 text-sm font-bold text-rose-100 transition hover:bg-rose-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            <span aria-hidden>📡</span>
            Book a live session
          </Link>
        </section>
      )}
      {isOwner && (
        <section className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-rose-400/35 bg-rose-500/[0.05] p-4">
          <span
            aria-hidden
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-lg text-rose-100"
          >
            🎙️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-200">
              Live engagement
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              Go live to your fans
            </p>
            <p className="text-[11px] text-white/55">
              Open a live listening room. Fans can license tracks while they
              play and the room records to your Replay Drops.
            </p>
          </div>
          <Link
            href="/studio/live"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-black uppercase tracking-wider text-white transition hover:bg-rose-400"
          >
            Open live room
          </Link>
        </section>
      )}

      {/* Viewer invite progress — visible only when a signed-in
          non-owner visits. We surface their personal milestone
          progress (5 / 10 / 50 invites) on every studio page so the
          social-proof + battle-share growth loop ties back into
          the artist surfaces. Hidden for owners (their own studio is
          a weird place to show their personal invite stats; the
          dedicated /invite page handles that). */}
      {session?.user?.id && !isOwner && nextMilestone !== null && (
        <section className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-fuchsia-400/35 bg-fuchsia-500/[0.05] p-4">
          <span
            aria-hidden
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-lg text-fuchsia-100"
          >
            ✉️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-fuchsia-200">
              Your invite milestones
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {viewerInviteCount} invited · {nextMilestone - viewerInviteCount}{" "}
              {nextMilestone - viewerInviteCount === 1 ? "invite" : "invites"} to your next badge
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {INVITE_MILESTONES.map((m) => {
                const hit = viewerInviteCount >= m;
                return (
                  <span
                    key={m}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${
                      hit
                        ? "border-fuchsia-300/70 bg-fuchsia-400/20 text-fuchsia-100"
                        : "border-white/15 bg-white/5 text-white/55"
                    }`}
                  >
                    {hit ? "✓" : "○"} INVITE_{m}
                  </span>
                );
              })}
            </div>
          </div>
          <Link
            href="/invite"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-fuchsia-300/45 bg-fuchsia-400/15 px-4 text-sm font-bold text-fuchsia-100 transition hover:bg-fuchsia-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
          >
            <span aria-hidden>🎁</span>
            Get my invite link
          </Link>
        </section>
      )}

      {/* Pinned announcement — the artist's freshest update. We treat the
          most recent post (≤14 days old) as pinned without a Post.isPinned
          column; sufficiently fresh content is, by definition, the
          announcement. Visitors see this before the Top 3 so artist
          intent ("new release", "battle this Friday") lands before
          listening. */}
      {pinnedPost && (
        <section className="mt-6 rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-400/8 via-fuchsia-500/5 to-rose-500/8 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-amber-200">
              <span aria-hidden>📌</span>
              Pinned · Latest update
            </p>
            <span className="text-[11px] text-white/45">
              {formatTimeAgo(pinnedPost.createdAt)}
            </span>
          </div>
          <PostCard
            id={pinnedPost.id}
            body={pinnedPost.body}
            imageUrl={pinnedPost.imageUrl}
            muxPlaybackId={pinnedPost.muxPlaybackId}
            videoStatus={pinnedPost.videoStatus}
            videoAspectRatio={pinnedPost.videoAspectRatio}
            createdAt={pinnedPost.createdAt}
            author={{
              id: user.id,
              name: user.name,
              image: user.image,
              role: user.role,
              studio: { username: studio.username },
            }}
            likeCount={pinnedPost._count.likes}
            commentCount={pinnedPost._count.comments}
            likedByMe={false}
            isOwner={isOwner}
          />
        </section>
      )}

      {/* Top 3 — leads with the platform's ranked best so visitors don't
          scroll past every track to find the strongest one. EMS Score
          badge on each card makes the AI-quality status read as proof.
          Rank #1 gets a crown treatment via the SongCard's existing
          rankPosition prop. */}
      {topSongs.length > 0 && (
        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-gold-300">
                Top tracks · ranked by EMS Score
              </p>
              <h2 className="mt-1 text-2xl font-extrabold">
                Lead with the strongest catalog
              </h2>
            </div>
            {user.songs.length > topSongs.length && (
              <Link
                href="#full-catalog"
                className="text-xs font-bold uppercase tracking-wider text-white/55 transition hover:text-white"
              >
                See all {user._count.songs} →
              </Link>
            )}
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {topSongs.map((song, index) => (
              <SongCard
                key={song.id}
                id={song.id}
                title={song.title}
                artist={song.artist}
                genre={song.genre}
                coverUrl={song.coverUrl}
                audioUrl={song.audioUrl}
                licensePrice={song.licensePrice.toString()}
                revenueSharePct={song.revenueSharePct.toString()}
                soldLicenses={song.soldLicenses}
                totalLicenses={song.totalLicenses}
                bpm={song.bpm}
                musicalKey={song.key}
                aiScore={song.aiScore}
                hasStems={song.hasStems}
                mood={moodFor({ bpm: song.bpm, genre: song.genre })}
                rankPosition={index + 1}
                verzuzHref={buildVerzuzHrefFor(song.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Songs", value: user._count.songs },
          { label: "Avg EMS Score", value: avgScore.toFixed(1) },
          { label: "Licenses Sold", value: totalLicensesSold },
          { label: "Licenses Held", value: user.licenses.length },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4 text-center">
            <p className="text-xs text-white/50">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-brand-400">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Avg AI Score bar */}
      <div className="mt-6">
        <AiScoreBar score={avgScore} />
      </div>

      {/* Trust strip — payout status (plain English, not just a
          "verified" badge) + a 30-day payout estimate. Both buyers and
          existing license holders need this. Buyers: "the money flows
          to a real person" reduces hesitation. Holders: "you can see
          what your share looks like" is the transparency Phase 2 calls
          out as a critical unmet need. */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 ${
            user.connectChargesEnabled && user.connectPayoutsEnabled
              ? "border-emerald-400/40 bg-emerald-500/[0.06]"
              : "border-white/10 bg-white/[0.03]"
          }`}
        >
          <span
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg ${
              user.connectChargesEnabled && user.connectPayoutsEnabled
                ? "bg-emerald-500/20 text-emerald-100"
                : "bg-white/10 text-white/55"
            }`}
            aria-hidden
          >
            {user.connectChargesEnabled && user.connectPayoutsEnabled ? "💳" : "⏳"}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200/85">
              Payout status
            </p>
            {user.connectChargesEnabled && user.connectPayoutsEnabled ? (
              <>
                <p className="mt-0.5 text-sm font-bold text-white">
                  Stripe connected — payouts active
                </p>
                <p className="text-[11px] text-white/55">
                  License sales pay this artist directly through Stripe Connect.
                </p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-sm font-bold text-white">
                  Payout setup pending
                </p>
                <p className="text-[11px] text-white/55">
                  This artist hasn&apos;t finished Stripe Connect onboarding.
                  License sales still go through escrow until they do.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-gold-400/30 bg-gold-500/[0.05] p-4">
          <span
            aria-hidden
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-lg text-gold-100"
          >
            📈
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-200/85">
              Next payout estimate
            </p>
            {last30dCount > 0 ? (
              <>
                <p className="mt-0.5 text-sm font-bold text-white">
                  ~${last30dRevenue.toFixed(2)}{" "}
                  <span className="font-normal text-white/55">
                    last 30 days · gross from licenses
                  </span>
                </p>
                <p className="text-[11px] text-white/55">
                  {last30dCount} sale{last30dCount === 1 ? "" : "s"} ·
                  artist receives the platform-fee net (Stripe dashboard for exact figures).
                </p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-sm font-bold text-white/75">
                  No license sales in the last 30 days
                </p>
                <p className="text-[11px] text-white/55">
                  Buy a license to be the first revenue line of this cycle.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Verzuz history */}
      {verzuzMatches.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                🏆 Verzuz history
              </h2>
              <p className="text-xs text-white/45">
                {verzuzWins}W · {verzuzLosses}L{verzuzTies > 0 ? ` · ${verzuzTies}T` : ""}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {verzuzMatches.slice(0, 6).map((m) => {
              const score = tallyRounds(m.rounds);
              const userIsA = m.artistAId === user.id;
              const userScore = userIsA ? score.aWins : score.bWins;
              const opponentScore = userIsA ? score.bWins : score.aWins;
              const opponentName = userIsA ? m.artistBName : m.artistAName;
              const completed = m.status === "COMPLETED";
              const won = completed && userScore > opponentScore;
              const lost = completed && userScore < opponentScore;
              const tone = m.status === "LIVE"
                ? "border-red-500/45 bg-red-500/8"
                : won
                  ? "border-emerald-500/35 bg-emerald-500/8"
                  : lost
                    ? "border-white/10 bg-white/4"
                    : "border-gold-400/25 bg-gold-400/5";
              return (
                <Link
                  key={m.id}
                  href={`/verzuz/${m.id}`}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-4 transition hover:bg-white/8 ${tone}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">vs {opponentName}</p>
                    {m.theme && (
                      <p className="mt-0.5 truncate text-xs text-white/45">{m.theme}</p>
                    )}
                    <p className="mt-1 text-[11px] uppercase tracking-widest text-white/35">
                      {completed
                        ? won ? "Won" : lost ? "Lost" : "Tied"
                        : m.status === "LIVE"
                          ? "Live now"
                          : new Date(m.startsAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-2xl font-black tabular-nums">
                    {userScore}-{opponentScore}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Replay drops — saved listening sessions */}
      {user.roomsHosted.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">
            🎧 Replay Drops <span className="text-sm font-normal text-white/40">— saved listening sessions</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {user.roomsHosted.map((r) => {
              const recording = r.recordings[0];
              const mins = recording?.durationSeconds
                ? Math.round(recording.durationSeconds / 60)
                : null;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-4"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-2xl">
                    🎙️
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.title}</p>
                    <p className="text-xs text-white/40">
                      {new Date(r.startedAt).toLocaleDateString()}
                      {mins ? ` · ${mins} min` : ""}
                    </p>
                  </div>
                  {recording?.playbackUrl && (
                    <a
                      href={recording.playbackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
                    >
                      ▶ Play
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Posts / Timeline — `remainingPosts` excludes the pinned post
          already rendered above so visitors don't see it twice. */}
      {remainingPosts.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">Updates</h2>
          <div className="space-y-4">
            {remainingPosts.map((p) => (
              <PostCard
                key={p.id}
                id={p.id}
                body={p.body}
                imageUrl={p.imageUrl}
                muxPlaybackId={p.muxPlaybackId}
                videoStatus={p.videoStatus}
                videoAspectRatio={p.videoAspectRatio}
                createdAt={p.createdAt}
                author={{
                  id: user.id,
                  name: user.name,
                  image: user.image,
                  role: user.role,
                  studio: { username: studio.username },
                }}
                likeCount={p._count.likes}
                commentCount={p._count.comments}
                likedByMe={false}
                isOwner={isOwner}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently Sold Licenses — social-proof bar that reduces buyer
          hesitation. Renders only when there's been at least one sale
          in the last 7 days; older catalogs without recent momentum
          would feel hollow with "0 in last 24h" rather than reassuring.
          Numbers are server-rendered so they're in the initial HTML
          and visible without JS. */}
      {licensesLast7d > 0 && (
        <section className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] px-4 py-3 text-sm">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-base">
            ✅
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-emerald-100">
              {licensesLast24h > 0 ? (
                <>
                  <span className="text-emerald-200">{licensesLast24h}</span>{" "}
                  {licensesLast24h === 1 ? "license" : "licenses"} sold in the last 24 hours
                </>
              ) : (
                <>
                  <span className="text-emerald-200">{licensesLast7d}</span>{" "}
                  {licensesLast7d === 1 ? "license" : "licenses"} sold this week
                </>
              )}
            </p>
            {lastLicenseRow && (
              <p className="text-[11px] text-emerald-200/65">
                Last sale {formatTimeAgo(lastLicenseRow.purchasedAt)}
                {lastLicenseRow.holder.name
                  ? ` · ${lastLicenseRow.holder.name} joined the collector wall`
                  : ""}
              </p>
            )}
          </div>
          {headlineSong && (
            <Link
              href={`/track/${headlineSong.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-500/20"
            >
              Be next →
            </Link>
          )}
        </section>
      )}

      {/* Services this artist sells — mixing, mastering, beats,
          templates, drum kits, lessons. Pulls from ServiceListing
          (status=LIVE) and renders sorted by totalSold. Lets every
          studio be a real shop, not just a license catalog. Each
          card carries the kind chip + price + delivery time so
          buyers can compare at a glance; clicking routes to the
          existing /services/[id] page where the full description
          + ordering flow lives. */}
      {serviceListings.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-300">
                Services · For hire
              </p>
              <h2 className="mt-1 text-xl font-extrabold">
                Hire {user.name ?? username}
              </h2>
            </div>
            <Link
              href={`/services?provider=${encodeURIComponent(username)}`}
              className="text-xs font-bold uppercase tracking-wider text-white/55 transition hover:text-white"
            >
              See all →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {serviceListings.map((svc) => {
              const kindLabel = (() => {
                switch (svc.kind) {
                  case "MIX": return "Mix engineer";
                  case "MASTER": return "Master";
                  case "MIX_MASTER_BUNDLE": return "Mix + Master";
                  case "PRODUCER_TEMPLATE": return "Project template";
                  case "BEAT": return "Beat license";
                  case "DRUM_KIT": return "Drum kit";
                  case "SAMPLE_PACK": return "Sample pack";
                  case "LESSON": return "1:1 lesson";
                  default: return svc.kind;
                }
              })();
              const price = Number(svc.priceUsd);
              return (
                <Link
                  key={svc.id}
                  href={`/services/${svc.id}`}
                  className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c0c14] to-[#0a0a12] p-4 transition hover:border-violet-400/45 hover:from-violet-500/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">
                        {kindLabel}
                      </p>
                      <p className="mt-1 line-clamp-2 font-bold text-white">
                        {svc.title}
                      </p>
                    </div>
                    {svc.coverUrl ? (
                      <Image
                        src={svc.coverUrl}
                        alt=""
                        width={56}
                        height={56}
                        className="h-14 w-14 flex-shrink-0 rounded-lg border border-white/10 object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 text-xl"
                      >
                        🎚️
                      </div>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs text-white/55">
                    {svc.description}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-black text-violet-200">
                      ${price.toFixed(2)}
                    </span>
                    <span className="text-white/45">
                      {svc.deliveryDays}d delivery
                      {svc.rating != null && svc.ratingCount > 0 && (
                        <span className="ml-2 text-amber-200">
                          ★ {svc.rating.toFixed(1)} ({svc.ratingCount})
                        </span>
                      )}
                      {svc.totalSold > 0 && (
                        <span className="ml-2">· {svc.totalSold} sold</span>
                      )}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Full catalog — everything past the top 3. Empty when the artist
          has 0–3 tracks (the Top section already covers them). EMS
          Score + mood + stems flags pass through every card so sync
          buyers and remixers see the same metadata in every position. */}
      <section id="full-catalog" className="mt-12">
        <h2 className="mb-4 text-xl font-semibold">
          {restSongs.length > 0 ? "More from this artist" : "Songs"}
        </h2>
        {user.songs.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-white/30">
            <p>No songs uploaded yet.</p>
          </div>
        ) : restSongs.length === 0 ? null : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {restSongs.map((song, index) => (
              <SongCard
                key={song.id}
                id={song.id}
                title={song.title}
                artist={song.artist}
                genre={song.genre}
                coverUrl={song.coverUrl}
                audioUrl={song.audioUrl}
                licensePrice={song.licensePrice.toString()}
                revenueSharePct={song.revenueSharePct.toString()}
                soldLicenses={song.soldLicenses}
                totalLicenses={song.totalLicenses}
                bpm={song.bpm}
                musicalKey={song.key}
                aiScore={song.aiScore}
                hasStems={song.hasStems}
                mood={moodFor({ bpm: song.bpm, genre: song.genre })}
                rankPosition={index + 4}
                verzuzHref={buildVerzuzHrefFor(song.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Fans are talking — most recent comments across the artist's
          catalog. Surfaces engagement at-a-glance without forcing the
          visitor to open every track page. Each row links to the track
          where the full thread lives. Pinned to bottom-half of the
          page because it's social proof, not a primary money action. */}
      {recentComments.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-sky-300">
                Fans are talking
              </p>
              <h2 className="mt-1 text-xl font-extrabold">
                Recent track reactions
              </h2>
            </div>
          </div>
          <ul className="space-y-2">
            {recentComments.map((c) => {
              const authorName = c.author.name ?? "Anonymous";
              const initial = authorName.trim().charAt(0).toUpperCase() || "?";
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-sky-500/30 to-violet-500/30 text-sm font-black"
                  >
                    {c.author.image ? (
                      <Image
                        src={c.author.image}
                        alt=""
                        width={36}
                        height={36}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      initial
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white/55">
                      <span className="font-bold text-white/80">{authorName}</span>
                      {" on "}
                      <Link
                        href={`/track/${c.song.id}`}
                        className="font-bold text-sky-200 hover:text-sky-100"
                      >
                        {c.song.title}
                      </Link>
                      {" · "}
                      {c.createdAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-white/85">
                      {c.body}
                    </p>
                  </div>
                  <Link
                    href={`/track/${c.song.id}#comments`}
                    className="shrink-0 self-center rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold text-white/55 hover:bg-white/10"
                  >
                    Reply →
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Fan Collector Wall — public recognition for the people backing
          this artist. Renders only when at least one fan has bought a
          license. The earliest supporter gets a special pinned slot
          even when they don't have the highest license count, because
          "first to back you" is a different kind of status than
          "biggest holder". Wall is read-only — clicking a card jumps
          to the fan's own studio page if they have one. */}
      {topCollectors.length > 0 && (
        <section className="mt-12 rounded-3xl border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/5 via-rose-500/5 to-amber-500/5 p-6 sm:p-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-fuchsia-300/85">
                Fan Collector Wall
              </p>
              <h2 className="mt-1 text-2xl font-extrabold">
                The people backing {user.name ?? username}
              </h2>
              <p className="mt-1 text-sm text-white/55">
                Top license holders + earliest supporters. Find an artist
                early, your name lives here.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-right">
              <p className="font-mono text-2xl font-extrabold tabular-nums text-fuchsia-200">
                {totalLicensesSold}
              </p>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
                {totalLicensesSold === 1 ? "license" : "licenses"} sold
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topCollectors.map((entry, idx) => {
              const { holder, count, firstAt } = entry;
              const isEarliest =
                earliestSupporter?.holder.id === holder.id;
              const displayName = holder.name ?? "Anonymous fan";
              const studioHref = holder.studio?.username
                ? `/studio/${holder.studio.username}`
                : null;
              const initial = displayName.trim().charAt(0).toUpperCase() || "?";
              const inner = (
                <div
                  className={`flex items-center gap-3 rounded-xl border bg-black/30 p-3 transition ${
                    isEarliest
                      ? "border-gold-400/50 shadow-[0_0_20px_-8px_rgba(245,200,120,0.6)]"
                      : "border-white/10 hover:border-fuchsia-300/45"
                  }`}
                >
                  <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br from-fuchsia-500/30 to-rose-500/30">
                    {holder.image ? (
                      <Image
                        src={holder.image}
                        alt=""
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-lg font-black text-white/70">
                        {initial}
                      </span>
                    )}
                    {idx < 3 && (
                      <span
                        aria-hidden
                        className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-black bg-gold-400 text-[10px] font-black text-black"
                      >
                        {idx + 1}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {displayName}
                    </p>
                    <p className="text-[11px] text-white/55">
                      {count} {count === 1 ? "license" : "licenses"} ·
                      {" "}
                      since {firstAt.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                    </p>
                    {isEarliest && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-gold-400/40 bg-gold-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-gold-200">
                        <span aria-hidden>★</span>
                        Earliest supporter
                      </p>
                    )}
                  </div>
                </div>
              );
              return studioHref ? (
                <Link
                  key={holder.id}
                  href={studioHref}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
                >
                  {inner}
                </Link>
              ) : (
                <div key={holder.id}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      {/* Legacy / Vault — the artist's personal archive room. Heavy gold
          treatment with brass studs + an embossed plaque feel so it reads
          as "the vault on the door of their studio." Same aesthetic as
          /vault so the journey between the two surfaces feels continuous. */}
      {legacySongs.length > 0 && (
        <section className="relative mt-16 overflow-hidden rounded-3xl border-2 border-amber-500/45 bg-gradient-to-b from-[#1a1305] via-[#0e0a02] to-[#0a0700] shadow-[inset_0_2px_0_rgba(245,200,120,0.18),0_30px_60px_-30px_rgba(245,158,11,0.5)]">
          {/* Brass stud rivets along the top + bottom borders */}
          <div aria-hidden className="pointer-events-none absolute inset-x-6 top-2 flex justify-between sm:inset-x-10">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={`top-${i}`}
                className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 shadow-[0_0_8px_rgba(245,200,120,0.55),inset_0_1px_0_rgba(255,255,255,0.4)]"
              />
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-2 flex justify-between sm:inset-x-10">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={`bot-${i}`}
                className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 shadow-[0_0_8px_rgba(245,200,120,0.55),inset_0_1px_0_rgba(255,255,255,0.4)]"
              />
            ))}
          </div>

          {/* Header — engraved plaque vibes */}
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-amber-500/25 bg-gradient-to-r from-amber-500/8 via-transparent to-amber-500/8 px-6 py-6 sm:px-10">
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-amber-400/55 bg-gradient-to-b from-amber-400/25 to-amber-700/15 text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
              >
                📼
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300/85">
                  The Vault · Legacy Archive
                </p>
                <h2 className="mt-1 font-serif text-2xl font-black tracking-tight text-amber-100 drop-shadow-[0_2px_0_rgba(120,80,15,0.6)] sm:text-3xl">
                  {user.name ?? "This artist"}&apos;s archive
                </h2>
                <p className="mt-1 max-w-xl text-sm text-amber-100/70">
                  Older releases, demos, and back-when-I-used-to-rap
                  material. Stream it, license it, share it like the day it
                  dropped.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/40 bg-gradient-to-b from-amber-500/15 to-transparent px-4 py-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <p className="font-serif text-3xl font-black text-amber-100 tabular-nums">
                {legacySongs.length}
              </p>
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-300/75">
                {legacySongs.length === 1 ? "track" : "tracks"} on file
              </p>
            </div>
          </div>

          <div className="grid gap-5 px-6 py-7 sm:grid-cols-2 sm:px-10 lg:grid-cols-3">
            {legacySongs.map((song) => (
              <div
                key={song.id}
                className="group relative rounded-2xl border border-amber-500/25 bg-gradient-to-b from-[#15100a]/60 to-[#0a0700]/60 p-2 backdrop-blur-md transition hover:border-amber-400/55 hover:shadow-[0_18px_38px_-15px_rgba(245,158,11,0.45)]"
              >
                {song.originalReleaseYear && (
                  <span className="absolute -top-2 left-4 z-10 rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-300 to-amber-500 px-2 py-0.5 text-[10px] font-black tracking-[0.24em] text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_6px_rgba(245,158,11,0.4)]">
                    {song.originalReleaseYear}
                  </span>
                )}
                <span
                  aria-hidden
                  className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-amber-400/85 shadow-[0_0_8px_rgba(245,200,120,0.55)]"
                />
                <SongCard
                  id={song.id}
                  title={song.title}
                  artist={song.artist}
                  genre={song.genre}
                  coverUrl={song.coverUrl}
                  audioUrl={song.audioUrl}
                  licensePrice={song.licensePrice.toString()}
                  revenueSharePct={song.revenueSharePct.toString()}
                  soldLicenses={song.soldLicenses}
                  totalLicenses={song.totalLicenses}
                  bpm={song.bpm}
                  musicalKey={song.key}
                  aiScore={song.aiScore}
                  hasStems={song.hasStems}
                  mood={moodFor({ bpm: song.bpm, genre: song.genre })}
                  verzuzHref={buildVerzuzHrefFor(song.id)}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import Image from "next/image";
import { getDemoTracks } from "@/lib/demoTracks";
import { isLaunchCatalogTrack } from "@/lib/launchCatalog";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@ems/utils";
import { CACHE_TAGS } from "@/lib/cacheTags";
import HomeVersusRail from "@/components/HomeVersusRail";
import HeroNowSpinning from "@/components/HeroNowSpinning";
import AudioPlayer from "@/components/LazyAudioPlayer";
import HomeSplitCtas from "@/components/HomeSplitCtas";
import HomeHeroMessaging from "@/components/HomeHeroMessaging";
import HomeVisualEffectsGate from "@/components/HomeVisualEffectsGate";
import AnimatedBackdropClient from "@/components/backdrops/AnimatedBackdropClient";
import HomeFirstVisitStudioTour from "@/components/HomeFirstVisitStudioTour";
import HomeMarketplaceActivityTicker from "@/components/HomeMarketplaceActivityTicker";
import HomeAudiencePaths from "@/components/HomeAudiencePaths";

export const revalidate = 60;

export const metadata: Metadata = {
  // `absolute` opts out of the layout's `"%s | Epic Music Space"` template
  // so the home title doesn't render as "Epic Music Space — … | Epic Music Space".
  title: { absolute: "Epic Music Space — The Fastest-Growing Social Platform for Music" },
  description:
    "Connect live with millions of music fans and artists. Host listening rooms, battle for chart dominance, discover trending music, and earn as you share. The social platform where music creators thrive.",
  alternates: { canonical: "/" },
};

type SampleSong = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  audioUrl: string;
  coverUrl?: string | null;
  bpm: number | null;
  key: string | null;
  licensePrice: string;
  revenueSharePct: string;
  totalLicenses: number;
  soldLicenses: number;
  aiScore: number;
  description?: string | null;
};

type HomeData = {
  songCount: number;
  licenseCount: number;
  totalRevenue: number;
  liveRoomCount: number;
  activeBattleCount: number;
  followCount: number;
  sampleSongs: SampleSong[];
};

function mapDemoTracksToSampleSongs(tracks: Awaited<ReturnType<typeof getDemoTracks>>): SampleSong[] {
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    genre: track.genre,
    audioUrl: track.audioUrl,
    coverUrl: track.coverUrl,
    bpm: track.bpm,
    key: track.key,
    licensePrice: track.licensePrice,
    revenueSharePct: track.revenueSharePct,
    totalLicenses: track.totalLicenses,
    soldLicenses: track.soldLicenses,
    aiScore: track.aiScore,
    description: track.description,
  }));
}

const marqueeItems = [
  "Follow Your Favorite Artists",
  "Discover Tomorrow's Hits",
  "Vote on Live Battles",
  "Join Listening Rooms",
  "Share & Go Viral",
  "100% Artist Revenue*",
  "Connect Live Tonight",
  "Build Your Music Community",
  "Real-Time Fan Engagement",
  "Follow Your Favorite Artists",
  "Discover Tomorrow's Hits",
  "Vote on Live Battles",
  "Join Listening Rooms",
  "Share & Go Viral",
  "100% Artist Revenue*",
  "Connect Live Tonight",
  "Build Your Music Community",
  "Real-Time Fan Engagement",
];

const getHomeData = unstable_cache(
  async (): Promise<HomeData> => {
    const demoSampleSongs = mapDemoTracksToSampleSongs(await getDemoTracks());
    const emptyHomeData: HomeData = {
      songCount: 0,
      licenseCount: 0,
      totalRevenue: 0,
      liveRoomCount: 0,
      activeBattleCount: 0,
      followCount: 0,
      sampleSongs: demoSampleSongs,
    };

    if (!hasUsableDatabaseUrl()) return emptyHomeData;
    try {
      const [songCount, licenseCount, transactionSum, liveRoomCount, activeBattleCount, followCount, sampleSongs] =
        await withTimeout(
          Promise.all([
            prisma.song.count({ where: { isActive: true } }),
            prisma.licenseToken.count({ where: { status: "ACTIVE" } }),
            prisma.transaction.aggregate({
              where: { status: "SUCCEEDED", type: "LICENSE_PURCHASE" },
              _sum: { amount: true },
            }),
            prisma.room.count({ where: { status: "LIVE" } }),
            prisma.versusMatch.count({ where: { status: "ACTIVE" } }),
            prisma.userFollow.count(),
            prisma.song.findMany({
              where: { isActive: true, audioUrl: { not: "" } },
              orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
              // Pull extra so we can still surface 3 real-artist tracks
              // after demoting the launch-catalog seeds.
              take: 12,
              select: {
                id: true,
                title: true,
                artist: true,
                genre: true,
                description: true,
                audioUrl: true,
                coverUrl: true,
                bpm: true,
                key: true,
                licensePrice: true,
                revenueSharePct: true,
                totalLicenses: true,
                soldLicenses: true,
                aiScore: true,
              },
            }),
          ]),
          2500,
        );

      return {
        songCount,
        licenseCount,
        totalRevenue: Number(transactionSum._sum.amount ?? 0),
        liveRoomCount,
        activeBattleCount,
        followCount,
        sampleSongs:
          sampleSongs.length > 0
            ? [...sampleSongs]
                // Real artist uploads outrank launch-catalog seed tracks,
                // regardless of seeded aiScore values. Seed tracks only
                // bubble up if there aren't enough real uploads to fill.
                .sort((a, b) => {
                  const aSeed = isLaunchCatalogTrack(a) ? 1 : 0;
                  const bSeed = isLaunchCatalogTrack(b) ? 1 : 0;
                  return aSeed - bSeed;
                })
                .slice(0, 3)
                .map((song) => ({
                  ...song,
                  licensePrice: song.licensePrice.toString(),
                  revenueSharePct: song.revenueSharePct.toString(),
                }))
            : demoSampleSongs,
      };
    } catch {
      return emptyHomeData;
    }
  },
  ["homepage-premium-studio-v1"],
  { revalidate: 3600, tags: [CACHE_TAGS.homepage, CACHE_TAGS.songs] },
);

function hasUsableDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;
  return ![
    "USER:PASSWORD@HOST",
    "PROJECT_REF:PASSWORD",
    "your-database",
    "your_db",
  ].some((placeholder) => databaseUrl.includes(placeholder));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Homepage data fetch timed out")), ms);
    }),
  ]);
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRevenue(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do listening sessions work on Epic Music Space?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You start a live room, queue your tracks, and your community joins in real time. Chat, reactions, and mic handoffs make every session feel like a release party, Q&A, and fan meetup at once.",
      },
    },
    {
      "@type": "Question",
      name: "How big can my listening room get?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Free rooms are built for your core supporters. Paid tiers unlock larger audiences, priority queue controls, and advanced host tools so you can run bigger events as your community scales.",
      },
    },
    {
      "@type": "Question",
      name: "How do artists make money on Epic Music Space?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Revenue comes from multiple social touchpoints: license sales, live-room tips, battle visibility, and streaming royalties. Fans can move from discovery to purchase in one tap. Artists keep 100% of each license sale, with a transparent 10% platform fee itemized on every payout.",
      },
    },
    {
      "@type": "Question",
      name: "Do I keep my rights?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. You own the master. Buyers receive a digital license under transparent terms — they don't own your music. Your catalog stays yours forever.",
      },
    },
  ],
};
const faqStructuredDataJson = JSON.stringify(faqStructuredData);

export default async function HomePage() {
  const {
    songCount,
    licenseCount,
    totalRevenue,
    liveRoomCount,
    activeBattleCount,
    followCount,
    sampleSongs,
  } =
    await getHomeData();

  // Honest social proof: only surface stats that have non-trivial values.
  // Zero stats are worse than no stats — they signal "nobody is here" to
  // a brand-new visitor. Anything below the threshold gets dropped, and
  // if too few survive we hide the section entirely (handled at render).
  const candidateStats = [
    { value: songCount,         num: `${formatCount(songCount)}+`,         label: "Active Tracks",       threshold: 5 },
    { value: licenseCount,      num: `${formatCount(licenseCount)}+`,      label: "Licenses Claimed",    threshold: 1 },
    { value: liveRoomCount,     num: `${formatCount(liveRoomCount)}+`,     label: "Live Rooms Now",      threshold: 1 },
    { value: activeBattleCount, num: `${formatCount(activeBattleCount)}+`, label: "Active Battles",      threshold: 1 },
    { value: followCount,       num: `${formatCount(followCount)}+`,       label: "Community Follows",   threshold: 1 },
    { value: totalRevenue,      num: formatRevenue(totalRevenue),          label: "Paid to Artists",     threshold: 1 },
  ];
  const displayStats = candidateStats.filter((s) => s.value >= s.threshold);

  return (
    <div className="relative">
      <HomeVisualEffectsGate />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqStructuredDataJson }}
      />

      {/* Studio control-room hero — replaces the prior Vice City hero.
          Reads as the front of a piece of pro audio gear: walnut top
          trim, ON-AIR LEDs, recessed LCD readouts, brushed steel
          faceplate. The first impression of the site IS the brand. */}
      <section className="studio-hero relative overflow-hidden">
        <AnimatedBackdropClient variant="hero" />

        <div className="relative z-[1] mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-16">
          {/* Top status bar — like the front-panel labels on a multi-channel
              recorder. Tells the visitor at a glance what this thing is. */}
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-md studio-faceplate-dark px-3 py-1.5">
              <span aria-hidden className="led-on-rec h-1.5 w-1.5 rounded-full animate-pulse" />
              <span className="studio-label text-rec-400">On Air</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-md studio-faceplate-dark px-3 py-1.5">
              <span aria-hidden className="led-on-amber h-1.5 w-1.5 rounded-full" />
              <span className="studio-label text-tube-300">Live Sessions</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-md studio-faceplate-dark px-3 py-1.5">
              <span aria-hidden className="led-on-green h-1.5 w-1.5 rounded-full" />
              <span className="studio-label text-white/70">Console Online</span>
            </span>
            <span className="studio-label ml-auto text-white/35 hidden sm:inline">
              EMS-01 · Master Console
            </span>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/25 bg-black/35 px-3 py-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-cyan-300" />
            <p className="studio-label text-cyan-100">
              Studio Ultra upgrade pass is live in production.
            </p>
            <Link
              href="/studio/ultra"
              className="ml-auto inline-flex items-center rounded-md border border-cyan-300/35 bg-cyan-500/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100"
            >
              Open Upgrade Center
            </Link>
          </div>

          <HomeHeroMessaging />
          <HomeSplitCtas
            placement="hero"
            containerClassName="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
            artistClassName="studio-engage-btn rounded-md px-6 py-3 font-display text-base uppercase tracking-[0.18em]"
            listenerClassName="rounded-md studio-faceplate-dark px-6 py-3 font-display text-base uppercase tracking-[0.18em] text-white/85 hover:text-white"
          />
          <HomeFirstVisitStudioTour />
          <HomeMarketplaceActivityTicker
            songs={sampleSongs}
            licenseCount={licenseCount}
            totalRevenue={totalRevenue}
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Start making",
                body: "Open the browser studio, build a beat, and keep the first version moving.",
                href: "/studio/try",
              },
              {
                title: "Find your lane",
                body: "Browse the marketplace, compare licenses, and preview tracks before you commit.",
                href: "/marketplace",
              },
              {
                title: "Set up fast",
                body: "Create an account, pick a role, and land in the right next step automatically.",
                href: "/auth/signup",
              },
            ].map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="home-panel group block px-5 py-5 transition hover:-translate-y-0.5"
              >
                <p className="home-kicker">
                  <span className="num">•</span>
                  <span> {item.title}</span>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{item.body}</p>
                <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-tube-400 underline decoration-dotted underline-offset-4 group-hover:text-tube-300">
                  Open →
                </p>
              </Link>
            ))}
          </div>
          <p className="mt-5 text-center studio-label text-white/55">
            Free to start · no card · flat 10% platform fee · 100% artist revenue
          </p>
          <p className="mt-3 text-center text-sm text-white/55">
            Just curious?{" "}
            <Link
              href="/studio/try"
              className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
            >
              Try the studio with no signup →
            </Link>
            <span className="mx-2 text-white/25">·</span>
            <Link
              href="/how-licenses-work"
              className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
            >
              How licenses work →
            </Link>
          </p>
          <HomeAudiencePaths />

          {sampleSongs[0] && (
            <div className="mt-10">
              <HeroNowSpinning
                song={sampleSongs[0]}
                secondary={sampleSongs[1] ?? null}
              />
            </div>
          )}

          {/* Stats meter bridge. Each stat is an LCD readout — reads as
              the level meters on the front of a console. Only renders when
              we have ≥3 real numbers to show. */}
          {displayStats.length >= 3 && (
            <div
              role="list"
              aria-label="Platform highlights"
              className="mt-10 grid gap-3 sm:grid-cols-2 md:grid-cols-4"
            >
              {displayStats.map((stat) => (
                <div
                  key={stat.label}
                  role="listitem"
                  className="home-screen p-4"
                >
                  <p className="studio-label relative z-10 text-white/45">
                    {stat.label}
                  </p>
                  <p className="text-readout-amber relative z-10 mt-1 text-3xl font-bold tabular-nums">
                    {stat.num}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Jump-to chips — patch-bay buttons. */}
          <div
            aria-label="Jump to key sections"
            className="mt-8 flex flex-wrap justify-center gap-2"
          >
            {[
              { href: "#journey", label: "How It Works" },
              { href: "#charts", label: "Trending Now" },
              { href: "#drops", label: "New Releases" },
            ].map((p) => (
              <a
                key={p.href}
                href={p.href}
                className="home-chip px-4 py-2 studio-label text-white/60 transition hover:text-tube-300"
              >
                {p.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Patch-bay ticker. The amber LED message strip across the top
          of every console says "this rig is live and worth listening
          to." Same role as the old marquee, sells the studio idea. */}
      <div className="studio-ticker" aria-hidden="true">
        <div className="studio-ticker-track py-3">
          {marqueeItems.map((item, i) => (
            <span key={`${item}-${i}`}>
              {item}
              <span className="dot">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* Live battles rail — renders only when there are active matches.
         Placed directly under the ticker so the first scrollable surface
         on /home is real, voteable activity, not marketing copy. */}
      <HomeVersusRail />

      {/* ============================================================
          PATCH BAY  ·  what this console does (your music social HQ)
          ============================================================ */}
      <section
        id="hq"
        className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20"
      >
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="studio-label text-tube-300">
              ◉ Patch Bay · Your Music Social HQ
            </p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              One console for your
              <br className="hidden sm:inline" /> profile, catalog, and fans.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
              Use the parts you need and skip the rest. Profile, catalog,
              services, battles, and live rooms all feed the same audience
              bus, so the whole site feels like one system instead of six
              disconnected pages.
            </p>
          </div>
          <span className="studio-label hidden text-white/35 sm:inline">
            BUS-A · ROOM 01
          </span>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              n: "01",
              slot: "Profile",
              h: "Claim your studio.",
              p: (
                <>
                  Bio, followers, badge collection, district rank, social
                  links, payouts. The page you point fans, labels, and
                  supervisors to instead of pasting six different URLs.{" "}
                  <Link
                    href="/auth/signup?role=ARTIST"
                    className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
                  >
                    Join the community →
                  </Link>
                </>
              ),
            },
            {
              n: "02",
              slot: "Catalog",
              h: "Share music. Build your fanbase.",
              p: "Upload tracks, set licensing terms in plain language, surface older material in The Vault, and let fans become license-holders who share revenue with you forever. Every license is 100% yours — flat 10% platform fee, itemized on every payout.",
            },
            {
              n: "03",
              slot: "Services",
              h: "Sell mixing, mastering, beats.",
              p: "Producers and engineers list services with clear scope, delivery time, and price. Fans and other artists book and pay through EMS — no third-party invoicing, no chasing.",
            },
            {
              n: "04",
              slot: "Battle",
              h: "Compete. Vote. Go viral.",
              p: (
                <>
                  Drop your track against another artist&apos;s. The whole
                  room votes live. Winners climb the charts overnight.
                  Democratic, real-time, no gatekeepers.{" "}
                  <Link
                    href="/versus"
                    className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
                  >
                    Enter a battle →
                  </Link>
                </>
              ),
            },
            {
              n: "05",
              slot: "Live Rooms",
              h: "Host. Connect. Monetize live.",
              p: "Open a live audio room for your album, your unreleased track, or a session with another artist. Talk between songs, pass the mic, and turn listeners into license-holders in real time — all in one room.",
            },
            {
              n: "06",
              slot: "Coming Soon",
              h: "Virtual studios + city districts.",
              p: "Walk into a 3D studio room, drop into another artist's booth, and watch your track climb the leaderboard inside a living city. Three districts (Label Row, Downtown Prime, Indie Blocks) — claim your block now and migrate your studio in on launch day.",
            },
          ].map((m) => (
            <article key={m.n} className="home-panel px-5 py-5">
              <p className="home-kicker">
                <span className="num">{m.n}</span>
                <span> / {m.slot}</span>
              </p>
              <h3 className="font-display text-2xl uppercase leading-tight tracking-wide text-white">
                {m.h}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {m.p}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ============================================================
          SIGNAL CHAIN  ·  artist-first journey (zero followers → live)
          ============================================================ */}
      <section
        id="journey"
        className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20"
      >
        <header className="mb-8">
          <p className="studio-label text-tube-300">
            ◉ Signal Chain · Artist Path
          </p>
          <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
            Zero followers to live community —
            <br className="hidden sm:inline" /> one clear signal path.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
            Plug in at stage one, ride the chain to stage four. No
            gatekeepers in line, no waiting for a playlist nod.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: "01",
              slot: "Studio",
              h: "Build your profile.",
              p: (
                <>
                  Choose your vanity URL, give your community one place to
                  follow every drop.{" "}
                  <Link
                    href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew"
                    className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
                  >
                    Start as artist →
                  </Link>
                </>
              ),
            },
            {
              n: "02",
              slot: "Upload",
              h: "Share your sound.",
              p: (
                <>
                  Audio, cover art, genre details, preview before it hits
                  your followers.{" "}
                  <Link
                    href="/studio/new"
                    className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
                  >
                    Upload track →
                  </Link>
                </>
              ),
            },
            {
              n: "03",
              slot: "License",
              h: "Monetize transparently.",
              p: "Pick the price, supply, and revenue share — shown on the track page so fans know exactly what they're supporting.",
            },
            {
              n: "04",
              slot: "Go Live",
              h: "Connect with your community.",
              p: "Host the drop, talk to listeners, pass the mic. Fans become supporters while the music plays.",
            },
          ].map((m) => (
            <article key={m.n} className="home-panel px-5 py-5">
              <p className="home-kicker">
                <span className="num">{m.n}</span>
                <span> / {m.slot}</span>
              </p>
              <h3 className="font-display text-xl uppercase leading-tight tracking-wide text-white">
                {m.h}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {m.p}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ============================================================
          MASTER BUS  ·  the listener side (discover, influence, support)
          ============================================================ */}
      <section
        id="listeners"
        className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20"
      >
        <header className="mb-8">
          <p className="studio-label text-tube-300">
            ◉ Master Bus · Built For Listeners
          </p>
          <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
            Discover artists early. Shape outcomes.
            <br className="hidden sm:inline" /> Support what you love.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
            Follow creators before they break, vote in live matchups, move
            from first play to direct support in seconds.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "01",
              slot: "Discover",
              h: "Get tomorrow's tracks first.",
              p: "Live rooms and trending feeds surface rising artists before the mainstream catches up.",
            },
            {
              n: "02",
              slot: "Influence",
              h: "Your votes shape visibility.",
              p: "Battle outcomes and room reactions feed the momentum signals that boost breakout songs.",
            },
            {
              n: "03",
              slot: "Support",
              h: "Back artists directly.",
              p: "Support through licenses and paid unlocks with transparent receipts and clear rights terms.",
            },
          ].map((m) => (
            <article key={m.n} className="home-panel px-5 py-5">
              <p className="home-kicker">
                <span className="num">{m.n}</span>
                <span> / {m.slot}</span>
              </p>
              <h3 className="font-display text-xl uppercase leading-tight tracking-wide text-white">
                {m.h}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {m.p}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ============================================================
          CHARTS  ·  community-powered leaderboard
          ============================================================ */}
      <section
        id="charts"
        className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20"
      >
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="studio-label text-tube-300">
              ◉ VU Charts · Fan-Powered
            </p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              Ranked by fans, not playlists.
              <br className="hidden sm:inline" /> Vote for who&apos;s next.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">
              Charts rank by battle wins, community votes, licenses sold,
              engagement. Every listener&apos;s vote counts equally. Climb
              the ranks without a label or a playlist deal.
            </p>
            <Link
              href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew"
              className="studio-engage-btn mt-6 inline-flex items-center gap-2 rounded-md px-6 py-3 font-display text-base uppercase tracking-[0.18em]"
            >
              Get on the charts →
            </Link>
          </div>

          <div className="home-panel px-5 py-5">
            <div className="mb-4 flex items-center gap-2">
              <span aria-hidden className="led-on-amber h-2 w-2 rounded-full" />
              <h3 className="studio-label-lg text-white/85">Top Tonight</h3>
              <span className="studio-label ml-auto text-white/35">
                CH-01 · Live
              </span>
            </div>
            <div className="space-y-2">
              {sampleSongs.map((song, i) => (
                <Link
                  key={song.id}
                  href={`/track/${song.id}`}
                  className="home-panel-soft flex items-center gap-3 px-3 py-2.5 transition hover:translate-x-0.5"
                >
                  <span className="text-readout-amber w-7 text-right text-lg font-bold tabular-nums">
                    0{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">
                      {song.title}
                    </p>
                    <p className="truncate text-xs text-white/50">
                      {song.artist}
                    </p>
                  </div>
                  <div className="home-screen px-2.5 py-1.5">
                    <p className="text-readout-cyan relative z-10 text-sm font-bold tabular-nums">
                      {song.aiScore.toFixed(1)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          CHANNEL STRIPS  ·  side-by-side artist / listener tracks
          ============================================================ */}
      <section className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Artist channel — walnut-trim hero panel */}
          <div className="home-panel flex flex-col p-6 sm:p-8">
            <div className="flex flex-1 flex-col">
              <div className="mb-3 flex items-center gap-2">
                <span aria-hidden className="led-on-rec h-2 w-2 animate-pulse rounded-full" />
                <p className="studio-label text-rec-400">For Artists · Channel A</p>
              </div>
              <h3 className="font-display text-3xl uppercase leading-tight tracking-wide text-white sm:text-4xl">
                Build. Connect. Grow.
                <br />
                <span className="text-tube-300">Earn from your community.</span>
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                Host live rooms, grow your fanbase, compete on leaderboards,
                monetize directly. No middleman. No playlist gatekeepers.
                Every fan connection leads to revenue, and you keep 100%.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="home-screen p-3">
                  <p className="studio-label relative z-10 text-white/45">
                    To You
                  </p>
                  <p className="text-readout-amber relative z-10 mt-1 text-2xl font-bold">
                    100%*
                  </p>
                </div>
                <div className="home-screen p-3">
                  <p className="studio-label relative z-10 text-white/45">
                    Engagement
                  </p>
                  <p className="text-readout-cyan relative z-10 mt-1 text-2xl font-bold">
                    Live
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-white/40">
                *Flat 10% platform fee per license, itemized on every payout —
                full breakdown on{" "}
                <Link
                  href="/pricing"
                  className="underline decoration-dotted underline-offset-2 hover:text-white/70"
                >
                  /pricing
                </Link>
                .
              </p>
              <Link
                href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew"
                className="studio-engage-btn mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 font-display text-base uppercase tracking-[0.18em]"
              >
                Join the community →
              </Link>
            </div>
          </div>

          {/* Listener channel — secondary brushed panel */}
          <div className="home-panel flex flex-col p-6 sm:p-8">
            <div className="mb-3 flex items-center gap-2">
              <span aria-hidden className="led-on-green h-2 w-2 rounded-full" />
              <p className="studio-label text-white/70">
                For Listeners · Channel B
              </p>
            </div>
            <h3 className="font-display text-3xl uppercase leading-tight tracking-wide text-white sm:text-4xl">
              Discover artists{" "}
              <span className="text-tube-300">before</span>
              <br />
              they go mainstream
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Watch live rooms, vote in battles, follow rising artists, and
              license directly from creators. Share revenue forever, discover
              music before the mainstream does — all on one platform.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {displayStats.slice(0, 2).map((stat) => (
                <div key={stat.label} className="home-screen p-3">
                  <p className="studio-label relative z-10 text-white/45">
                    {stat.label}
                  </p>
                  <p className="text-readout-amber relative z-10 mt-1 text-2xl font-bold">
                    {stat.num}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href="/marketplace"
              className="home-chip mt-auto inline-flex items-center justify-center gap-2 px-6 py-3 font-display text-base uppercase tracking-[0.18em] text-white/85 hover:text-white"
            >
              Browse the catalog →
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================
          FX RACK  ·  flagship features (versus + rooms + drops + score)
          ============================================================ */}
      <section className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <header className="mb-8">
          <p className="studio-label text-tube-300">
            ◉ FX Rack · How You Win On EMS
          </p>
          <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
            Every tool you need to break out —
            <br className="hidden sm:inline" /> in one studio.
          </h2>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { n: "Live", l: "Rooms every day" },
            { n: "Fan", l: "Votes move charts" },
            { n: "Instant", l: "Discovery → support" },
          ].map((p) => (
            <div key={p.l} className="home-panel-soft flex items-center gap-3 px-4 py-3">
              <span aria-hidden className="led-on-amber h-2 w-2 rounded-full" />
              <span className="text-readout-amber font-bold uppercase tracking-wide">
                {p.n}
              </span>
              <span className="text-xs text-white/55">{p.l}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="home-panel px-5 py-5">
            <p className="home-kicker">
              <span className="num">FX-01</span>
              <span> / Versus Battles · Flagship</span>
            </p>
            <h3 className="font-display text-2xl uppercase leading-tight tracking-wide text-white">
              Step in the ring tonight
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              The headline event on EMS. Drop your track against another
              artist&apos;s — fans watch live, vote in real time, and the
              winner climbs the charts overnight. Royales, Verzuz-style sets,
              rematches with bragging rights. The fastest way to go viral on
              EMS.
            </p>
            <Link
              href="/versus"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
            >
              Enter a battle →
            </Link>
          </article>

          <article className="home-panel px-5 py-5">
            <p className="home-kicker">
              <span className="num">FX-02</span>
              <span> / Live Listening Sessions</span>
            </p>
            <h3 className="font-display text-2xl uppercase leading-tight tracking-wide text-white">
              Your community, in one room
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Open a live audio room. Press play on your album, your
              unreleased track, your back catalog. Talk between songs. Read
              the chat. Hand the mic to fans. Family across the country, fans
              on the other side of the world — all in the same room with you.
            </p>
            <Link
              href="/rooms/new"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
            >
              Open a room →
            </Link>
          </article>

          <article className="home-panel px-5 py-5">
            <p className="home-kicker">
              <span className="num">FX-03</span>
              <span> / Real-Time Drops</span>
            </p>
            <h3 className="font-display text-2xl uppercase leading-tight tracking-wide text-white">
              Turn moments into momentum
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Every license sale fires a live notification. Your fans see the
              supply ticking down. The closer to sold-out, the more momentum.
              Drops feel like a moment — because they are.
            </p>
            <Link
              href="/marketplace"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
            >
              See the marketplace →
            </Link>
          </article>

          <article className="home-panel px-5 py-5">
            <p className="home-kicker">
              <span className="num">FX-04</span>
              <span> / EMS Score & Studio Brand</span>
            </p>
            <h3 className="font-display text-2xl uppercase leading-tight tracking-wide text-white">
              The profile that proves it
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Every track gets a score on composition, production, and market
              fit. Your studio profile shows the receipts — followers, sales,
              badges, district — all in one place. Make the song, let the AI
              be your A&R, and let your page do the talking.
            </p>
            <Link
              href="/leaderboard"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
            >
              See top scores →
            </Link>
          </article>
        </div>
      </section>

      {/* ============================================================
          THE VAULT  ·  legacy catalog, walnut-trim feature panel
          ============================================================ */}
      <section className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="home-panel p-6 sm:p-10">
          <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="studio-label text-tube-300">
                ◉ The Vault · Legacy Catalogs
              </p>
              <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
                Keep your classics alive.
                <br />
                <span className="text-tube-300">
                  Let new fans discover the history.
                </span>
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">
                Older releases. Demos that never got their moment. Records
                that disappeared off streaming. Tag a track as legacy and it
                lands in The Vault — a dedicated home for back-catalog work,
                where community discovery, shares, and support give timeless
                records a second life.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  "Year-tagged releases",
                  "Catalog-first discovery",
                  "Built for long-tail fans",
                ].map((p) => (
                  <span
                    key={p}
                    className="home-chip px-3 py-1.5 studio-label text-white/65"
                  >
                    {p}
                  </span>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/vault"
                  className="studio-engage-btn inline-flex items-center gap-2 rounded-md px-5 py-2.5 font-display text-sm uppercase tracking-[0.18em]"
                >
                  Open the vault →
                </Link>
                <Link
                  href="/vault/new"
                  prefetch={false}
                  className="inline-flex items-center gap-2 rounded-md studio-faceplate-dark px-5 py-2.5 font-display text-sm uppercase tracking-[0.18em] text-white/85 hover:text-white"
                >
                  Add your vault tracks
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1998", "2003", "2011", "2007", "2015", "1995"].map(
                (year, i) => (
                  <div
                    key={`${year}-${i}`}
                  className="home-screen flex aspect-square items-center justify-center"
                    aria-hidden="true"
                  >
                    <span className="text-readout-amber relative z-10 text-xl font-bold tabular-nums">
                      {year}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          TONIGHT'S DROPS  ·  trending tracks (server-rendered sample)
          ============================================================ */}
      <section
        id="drops"
        className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20"
      >
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="studio-label text-tube-300">
              ◉ Tape Bay · Tonight&apos;s Drops
            </p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              Music trending
              <br className="hidden sm:inline" /> in real time.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
              What the community is moving on right now. See supply, scores,
              live momentum — your next favorite is here.
            </p>
          </div>
          <span className="studio-label hidden text-white/35 sm:inline">
            BUS-B · LIVE
          </span>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sampleSongs.map((song) => (
            <article
              key={song.id}
              className="home-panel flex flex-col gap-3 p-4"
            >
              <Link
                href={`/track/${song.id}`}
                aria-label={`Open ${song.title}`}
                className="home-panel-soft relative block aspect-square overflow-hidden"
              >
                {song.coverUrl && (
                  <Image
                    src={song.coverUrl}
                    alt={song.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                    loading="lazy"
                  />
                )}
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/15 opacity-0 transition group-hover:opacity-100"
                  aria-hidden="true"
                >
                  <span className="rounded-full bg-black/65 p-3 backdrop-blur">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="white"
                      aria-hidden="true"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </span>
                </div>
              </Link>

              <div className="flex items-center justify-between">
                <span className="home-chip px-2 py-1 studio-label text-white/65">
                  {song.genre ?? "Electronic"}
                </span>
                {song.bpm && (
                  <span className="text-readout-cyan text-xs font-bold tabular-nums">
                    {song.bpm} BPM
                  </span>
                )}
              </div>

              <Link
                href={`/track/${song.id}`}
                className="block hover:text-tube-300"
              >
                <p className="font-display text-xl uppercase leading-tight tracking-wide text-white">
                  {song.title}
                </p>
              </Link>
              <p className="-mt-2 text-sm text-white/55">{song.artist}</p>

              <div className="mt-auto flex items-center justify-between">
                <div className="home-screen px-3 py-1.5">
                  <span className="text-readout-amber relative z-10 text-sm font-bold tabular-nums">
                    {formatPrice(song.licensePrice)}
                  </span>
                </div>
                <span className="text-[11px] text-white/45">
                  {song.soldLicenses}/{song.totalLicenses} claimed
                </span>
              </div>

              <div>
                <AudioPlayer
                  audioUrl={song.audioUrl}
                  title={song.title}
                  songId={song.id}
                />
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/marketplace"
            className="home-chip inline-flex items-center gap-2 px-6 py-3 font-display text-base uppercase tracking-[0.18em] text-white/85 hover:text-white"
          >
            See every track →
          </Link>
        </div>
      </section>

      {/* ============================================================
          MASTER FADER  ·  closing CTA with engage button
          ============================================================ */}
      <section className="relative z-[1] mx-auto max-w-4xl px-4 py-16 sm:py-24">
        <div className="home-panel p-8 text-center sm:p-12">
          <div>
            <div className="mb-3 inline-flex items-center gap-2">
              <span aria-hidden className="led-on-rec h-2 w-2 animate-pulse rounded-full" />
              <p className="studio-label text-rec-400">Master Fader · Your Move</p>
            </div>
            <h2 className="font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              Claim your profile.
              <br />
              Grow your community.
              <br />
              <span className="text-tube-300">Own the moment.</span>
            </h2>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["Free to start", "Live fan engagement", "Community discovery"].map(
                (p) => (
                  <span
                    key={p}
                    className="home-chip px-3 py-1.5 studio-label text-white/65"
                  >
                    {p}
                  </span>
                ),
              )}
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-white/60">
              Sign-up is free. Uploads are free. Your first battles are free.
              You only pay when you earn — every license sale is 100% yours,
              with a flat 10% platform fee itemized on every payout.
            </p>
            <HomeSplitCtas
              placement="closing"
              containerClassName="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
              artistClassName="studio-engage-btn rounded-md px-6 py-3 font-display text-base uppercase tracking-[0.18em]"
              listenerClassName="home-chip px-6 py-3 font-display text-base uppercase tracking-[0.18em] text-white/85 hover:text-white"
            />
            <p className="mt-6 studio-label text-white/45">
              Trusted payments · Transparent fees · Creator-first ownership
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import Image from "next/image";
import { getDemoTracks } from "@/lib/demoTracks";
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

const trackArtClasses = ["vc-track-art-1", "vc-track-art-2", "vc-track-art-3"];

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
              take: 3,
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
            ? sampleSongs.map((song) => ({
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

          <HomeHeroMessaging />
          <HomeSplitCtas
            placement="hero"
            containerClassName="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
            artistClassName="studio-engage-btn rounded-md px-6 py-3 font-display text-base uppercase tracking-[0.18em]"
            listenerClassName="rounded-md studio-faceplate-dark px-6 py-3 font-display text-base uppercase tracking-[0.18em] text-white/85 hover:text-white"
          />
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
          </p>

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
                  className="studio-screen p-4"
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
                className="rounded-md studio-faceplate-dark px-4 py-2 studio-label text-white/60 transition hover:text-tube-300"
              >
                {p.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <div className="vc-mobile-sticky-cta" aria-label="Quick action for artists">
        <Link
          href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew"
          className="vc-mobile-sticky-cta-btn"
        >
          Start Your Artist Studio
        </Link>
      </div>

      <div className="vc-marquee" aria-hidden="true">
        <div className="vc-marquee-track">
          {marqueeItems.map((item, i) => (
            <span key={`${item}-${i}`}>
              {item}
              <span className="dot"> ◆ </span>
            </span>
          ))}
        </div>
      </div>

      {/* Live battles rail — renders only when there are active matches.
         Placed directly under the marquee so the first scrollable surface
         on /home is real, voteable activity, not marketing copy. */}
      <HomeVersusRail />

      <section id="hq" className="vc-section vc-platform-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Your music social HQ</p>
          <h2 className="vc-section-title">
              One platform for your music community, your profile, your fanbase,
            <br />
              and your most engaged listeners.
          </h2>
          <p className="vc-section-sub">
              Epic Music Space is where music creators build thriving communities. Create your profile, connect with listeners in real time, host live rooms, 
              monetize directly from fans, and compete on leaderboards. Your studio, your community, your terms.
            Virtual studios and 3D city districts are next.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / Profile</span>
              <h3>Claim your studio.</h3>
              <p>
                  Your music profile — bio, followers, badge collection, district rank,
                social links, payouts. The page you point fans, labels, and
                supervisors to instead of pasting six different URLs.{" "}
                <Link href="/auth/signup?role=ARTIST" className="vc-feat-link">
                  Join the community →
                </Link>
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">02 / Catalog</span>
                <h3>Share music. Build your fanbase.</h3>
              <p>
                Upload tracks, set licensing terms in plain language, surface
                older material in The Vault, and let fans become license
                  holders who share revenue with you forever. Share your sound, grow your followers, 
                  and monetize directly. Every license goes 100% to you — a transparent 10% platform fee is
                  itemized on every payout.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">03 / Services</span>
              <h3>Sell mixing, mastering, beats.</h3>
              <p>
                Producers and engineers list services with clear scope,
                delivery time, and price. Fans and other artists book and
                  pay through EMS directly from the community. No third-party invoicing, no chasing.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">04 / Battle</span>
                <h3>Compete. Vote. Go viral.</h3>
              <p>
                Drop your track against another artist&apos;s. The whole room
                  votes live. Winners climb the charts overnight. This is
                  how artists go viral on EMS — democratic, real-time, no gatekeepers.{" "}
                <Link href="/versus" className="vc-feat-link">
                  Enter a Battle →
                </Link>
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">05 / Collaborate</span>
                <h3>Host. Connect. Monetize live.</h3>
              <p>
                Open a live audio room for your album, your unreleased track,
                or a session with another artist. Talk between songs, pass
                  the mic to your community, and turn listeners into license holders
                  in real time — all in one room.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">06 / Coming Soon</span>
              <h3>Virtual studios + city districts.</h3>
              <p>
                Walk into a 3D studio room, drop into another artist&apos;s
                booth, and watch your track climb the leaderboard inside a
                living city. Three districts (Label Row, Downtown Prime,
                Indie Blocks) — claim your block now and migrate your studio
                in on launch day.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="journey" className="vc-section vc-platform-section vc-below-fold">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Artist first journey</p>
          <h2 className="vc-section-title">
              From zero followers to live community — <span className="glow">one clear path.</span>
          </h2>
          <p className="vc-section-sub">
              Epic Music Space keeps it simple: create your profile, release a track, 
              go live with your community, and monetize directly. No gatekeepers. No waiting.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / Studio</span>
                <h3>Build your profile.</h3>
              <p>
                  Create your profile, choose your vanity URL, and give your community
                  one place to follow every drop. <Link href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew" className="vc-feat-link">Start as Artist →</Link>
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">02 / Upload</span>
                <h3>Share your sound.</h3>
              <p>
                Upload audio, add cover art, set genre details, and preview the
                  song before it hits your followers. <Link href="/studio/new" className="vc-feat-link">Upload Track →</Link>
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">03 / License</span>
                <h3>Monetize transparently.</h3>
              <p>
                Pick the license price, supply, and share shown on the track
                  page so your fans know exactly what they&apos;re supporting.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">04 / Go Live</span>
                <h3>Connect with your community.</h3>
              <p>
                  Host the drop, talk with listeners, pass the mic to your community, 
                  and let fans become supporters while the music plays.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="listeners" className="vc-section vc-listener-section vc-below-fold">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Built for listeners too</p>
          <h2 className="vc-section-title">
            Discover artists early, shape outcomes, and support what you love.
          </h2>
          <p className="vc-section-sub">
            Follow creators before they break, vote in live matchups, and move
            from first play to direct support in seconds.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / Discover</span>
              <h3>Get tomorrow&apos;s tracks first.</h3>
              <p>Live rooms and trending feeds surface rising artists before the mainstream catches up.</p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">02 / Influence</span>
              <h3>Your votes shape visibility.</h3>
              <p>Battle outcomes and room reactions feed momentum signals that boost breakout songs.</p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">03 / Support</span>
              <h3>Back artists directly.</h3>
              <p>Support through licenses and paid unlocks with transparent receipts and clear rights terms.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="vc-section vc-platform-section vc-below-fold">
        <div className="vc-container">
          <p className="vc-section-eyebrow">The flagship feature</p>
          <h2 className="vc-section-title">
              Host. Connect. Earn. —{" "}
            <span className="glow">turn every drop into an event.</span>
          </h2>
          <p className="vc-section-sub">
              Spotify and Apple are vending machines. Epic Music Space is a live community. 
              You host a listening room, your fans show up, the music plays together, 
              comments flow in real-time, mics get passed, and licenses sell while the song is playing.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / Open Doors</span>
              <h3>You&apos;re the host.</h3>
              <p>
                  Create a listening room in seconds. Share your album, unreleased track, 
                  or any playlist. Write what you want to say. Go live with your community.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">02 / They Show Up</span>
              <h3>Fans from anywhere.</h3>
              <p>
                Your mom in Atlanta, the producer in Berlin, the fan in Tokyo —
                they all join the same room and hear it at the same moment.
                Live chat fires. Reactions roll across the screen. The room
                feels the song with you.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">03 / Take the Floor</span>
              <h3>Pass the mic.</h3>
              <p>
                Listeners raise a hand. You decide who speaks. Talk through a
                verse, take a question, react to your own track. It&apos;s a
                concert, a Q&amp;A, and a release party — running at the same time.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">04 / They Buy In</span>
              <h3>Licenses sell live.</h3>
              <p>
                Every fan in the room is one tap from licensing the song
                they&apos;re hearing. Tips fly in. The supply ticks down. By
                the time the room empties, you&apos;ve been paid — and the
                holders go push your track to everyone they know.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">05 / Scale With Tier</span>
              <h3>Bigger plan, bigger room.</h3>
              <p>
                Free studios fit your inner circle. Paid tiers unlock larger
                rooms, longer sessions, priority queue tools, and replay drops.
                When you&apos;re ready to fill the building, the building grows
                with you.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">06 / Replay &amp; Resell</span>
              <h3>The session never dies.</h3>
              <p>
                Every session can be saved as a replay drop — your fans who
                missed it tune in later, licenses keep selling, and the room
                lives on as a moment in your catalog forever.
              </p>
            </article>
          </div>
          <div className="vc-catalog-link mt-8">
            <Link href="/rooms/new" className="vc-btn vc-btn-pink">
              Open a Room →
            </Link>
          </div>
        </div>
      </section>

      <section id="charts" className="vc-section vc-leaderboard-section vc-below-fold">
        <div className="vc-container">
          <div className="vc-lb-grid">
            <div>
                <p className="vc-section-eyebrow">Community-powered charts</p>
              <h2 className="vc-section-title">
                  Ranked by fans, not playlists. <span className="pink">Vote for who&apos;s next.</span>
              </h2>
              <p className="vc-section-sub">
                  Charts rank by battle wins, community votes, licenses sold, and engagement —
                  not gatekeepers or playlists. Every listener&apos;s vote counts equally.
                  Drop a track, win battles, and climb the ranks without a label or playlist deal.
              </p>
              <Link href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew" className="vc-btn vc-btn-pink">
                Get on the Charts →
              </Link>
            </div>
            <div className="vc-lb-table">
              <div className="vc-lb-header">
                <span>Rank</span>
                <span>Track</span>
                <span>Score</span>
              </div>
              {sampleSongs.map((song, i) => (
                <Link
                  key={song.id}
                  href={`/track/${song.id}`}
                  className={`vc-lb-row top${i + 1}`}
                >
                  <div className="vc-lb-rank">0{i + 1}</div>
                  <div>
                    <div className="vc-lb-track-name">{song.title}</div>
                    <div className="vc-lb-track-artist">{song.artist}</div>
                  </div>
                  <div className="vc-lb-streams">{song.aiScore.toFixed(1)}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="vc-section vc-split-section vc-below-fold">
        <div className="vc-container">
          <div className="vc-split-grid">
            <div className="vc-split-card artists">
              <div>
                <p className="vc-section-eyebrow vc-eyebrow-pink">
                  For Artists
                </p>
                <h3>
                    Build. Connect. Grow.
                    <br />
                    <span className="high">Earn from your community.</span>
                </h3>
                <p>
                    Host live rooms, grow your fanbase, compete on leaderboards, 
                    and monetize directly. No middleman. No playlist gatekeepers. 
                    Every fan connection leads to revenue, and you keep 100%.
                </p>
                <div className="vc-split-stats">
                  <div className="vc-stat">
                    <div className="num">100%*</div>
                      <div className="label">to You (minus 10% fee)</div>
                  </div>
                  <div className="vc-stat">
                    <div className="num">Live</div>
                      <div className="label">Community Engagement</div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-white/45">
                  *Flat 10% platform fee per license, itemized on every payout.
                  Full breakdown on{" "}
                  <Link href="/pricing" className="underline decoration-dotted underline-offset-2 hover:text-white/70">
                    /pricing
                  </Link>
                  .
                </p>
              </div>
              <Link
                href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew"
                className="vc-btn vc-btn-pink vc-split-cta"
              >
                  Join the Community →
              </Link>
            </div>

            <div className="vc-split-card creators">
              <div>
                <p className="vc-section-eyebrow vc-eyebrow-cyan">
                    For Listeners &amp; Supporters
                </p>
                <h3>
                    Discover artists <span className="high">before</span>
                  <br />
                    they go mainstream
                </h3>
                <p>
                    Watch live rooms, vote in battles, follow rising artists, and license 
                    directly from creators. Share revenue forever and discover music 
                    before the mainstream does — all on one platform.
                </p>
                <div className="vc-split-stats">
                  {displayStats.slice(0, 2).map((stat) => (
                    <div key={stat.label} className="vc-stat">
                      <div className="num">{stat.num}</div>
                      <div className="label">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                href="/marketplace"
                className="vc-btn vc-btn-ghost-cyan vc-split-cta"
              >
                Browse the Catalog
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="vc-section vc-feat-section vc-below-fold">
        <div className="vc-container">
          <p className="vc-section-eyebrow">How you win on EMS</p>
          <h2 className="vc-section-title">
            Every tool you need to <span className="glow">break out</span> —
            in one studio
          </h2>
          <div className="vc-social-proof-strip" aria-label="Community activity highlights">
            <div className="vc-social-proof-pill">
              <span className="num">Live</span>
              <span className="label">Rooms every day</span>
            </div>
            <div className="vc-social-proof-pill">
              <span className="num">Fan</span>
              <span className="label">Votes move charts</span>
            </div>
            <div className="vc-social-proof-pill">
              <span className="num">Instant</span>
              <span className="label">Discovery to support</span>
            </div>
          </div>
          <div className="vc-feat-grid vc-feat-grid-top">
            <div className="vc-feat-card versus">
              <span className="vc-feat-tag">Versus Battles · Flagship</span>
              <h3>Step in the ring tonight</h3>
              <p>
                The headline event on EMS. Drop your track against another
                artist&apos;s — fans watch live, vote in real time, and the
                winner climbs the charts overnight. Royales, Verzuz-style sets,
                rematches with bragging rights. The fastest way to go viral on
                EMS — no playlist gatekeepers, no cosigns required.
              </p>
              <Link href="/versus" className="vc-feat-link vc-feat-link-pink">
                Enter a Battle →
              </Link>
            </div>
            <div className="vc-feat-card">
              <span className="vc-feat-tag">Live Listening Sessions</span>
              <h3>Your community, in one room</h3>
              <p>
                Open a live audio room. Press play on your album, your unreleased
                track, your back catalog. Talk between songs. Read the chat. Hand
                the mic to fans when they raise a hand. Family across the country,
                fans on the other side of the world — all in the same room with
                you, hearing it together.
              </p>
              <Link href="/rooms/new" className="vc-feat-link">
                Open a Room →
              </Link>
            </div>
            <div className="vc-feat-card">
              <span className="vc-feat-tag">Real-Time Drops</span>
              <h3>Turn moments into momentum</h3>
              <p>
                Every license sale fires a live notification. Your fans see
                the supply ticking down. The closer to sold-out, the more
                momentum. Drops feel like a moment — because they are.
              </p>
              <Link href="/marketplace" className="vc-feat-link">
                See the Marketplace →
              </Link>
            </div>
            <div className="vc-feat-card versus">
              <span className="vc-feat-tag">EMS Score &amp; Studio Brand</span>
              <h3>The profile that proves it</h3>
              <p>
                Every track gets a score on composition, production, and market
                fit. Your studio profile shows the receipts — followers, sales,
                badges, district — all in one place. Make the song, let the AI
                be your A&amp;R, and let your page do the talking.
              </p>
              <Link
                href="/leaderboard"
                className="vc-feat-link vc-feat-link-pink"
              >
                See Top Scores →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The Vault — legacy catalog promo. Older artists with deep catalogs
          get a dignified, on-page surface; new fans get a discovery doorway. */}
      <section className="vc-section vc-below-fold">
        <div className="vc-container">
          <div className="vc-vault-shell">
            <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="vc-vault-eyebrow">
                  The Vault · Legacy catalogs, new community
                </p>
                <h2 className="vc-vault-title">
                  Keep your classics alive.
                  <br />
                  <span>Let new fans discover the history.</span>
                </h2>
                <p className="vc-vault-sub">
                  Older releases. Demos that never got their moment. Records
                  that disappeared off streaming. Tag a track as legacy and it
                  lands in The Vault — a dedicated home for back-catalog work,
                  where community discovery, shares, and support give timeless
                  records a second life.
                </p>
                <div className="vc-vault-pills" aria-label="Vault community signals">
                  <span>Year-tagged releases</span>
                  <span>Catalog-first discovery</span>
                  <span>Built for long-tail fans</span>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/vault"
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-amber-950 transition hover:bg-amber-300"
                  >
                    Open The Vault →
                  </Link>
                  <Link
                    href="/vault/new"
                    prefetch={false}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/8 px-5 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/14"
                  >
                    Add your vault tracks
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["1998", "2003", "2011", "2007", "2015", "1995"].map((year, i) => (
                  <div
                    key={`${year}-${i}`}
                    className="flex aspect-square items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/8 text-2xl font-black tracking-widest text-amber-100/85"
                    aria-hidden="true"
                  >
                    {year}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="drops" className="vc-section vc-tracks-section vc-below-fold">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Tonight&apos;s Drops</p>
          <h2 className="vc-section-title">
            Music trending <span className="glow">in real time</span>
          </h2>
          <p className="vc-section-sub">
            Trending in the community right now. Vote on battles, follow emerging artists, 
            license directly, and be part of what&apos;s blowing up. See supply, scores,
            and live momentum — your next favorite is here.
          </p>
          <div className="vc-tracks-grid">
            {sampleSongs.map((song, i) => (
              <article key={song.id} className="vc-track-card">
                <Link
                  href={`/track/${song.id}`}
                  className="vc-track-art-link"
                  aria-label={`Open ${song.title}`}
                >
                  <div
                    className={`vc-track-art ${
                      trackArtClasses[i] ?? "vc-track-art-default"
                    }`}
                  >
                    {song.coverUrl && (
                      <Image
                        src={song.coverUrl}
                        alt={song.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="vc-track-cover-img object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="vc-play" aria-hidden="true">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="white"
                        aria-hidden="true"
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  </div>
                </Link>
                <div className="vc-track-meta">
                  <span className="vc-track-genre">
                    {song.genre ?? "Electronic"}
                  </span>
                  {song.bpm && (
                    <span className="vc-track-bpm">{song.bpm} BPM</span>
                  )}
                </div>
                <Link href={`/track/${song.id}`} className="vc-track-name-link">
                  <div className="vc-track-name">{song.title}</div>
                </Link>
                <div className="vc-track-artist">{song.artist}</div>
                <div className="vc-track-footer">
                  <span className="vc-track-price">
                    {formatPrice(song.licensePrice)}
                  </span>
                  <span className="vc-track-license">
                    {song.soldLicenses}/{song.totalLicenses} claimed
                  </span>
                </div>
                <div className="vc-track-player">
                  <AudioPlayer
                    audioUrl={song.audioUrl}
                    title={song.title}
                    songId={song.id}
                  />
                </div>
              </article>
            ))}
          </div>
          <div className="vc-catalog-link">
            <Link href="/marketplace" className="vc-btn vc-btn-ghost">
              See Every Track
            </Link>
          </div>
        </div>
      </section>

      <section className="vc-section vc-closing-section vc-below-fold">
        <div className="vc-container vc-closing-inner">
          <p className="vc-eyebrow">Your move</p>
          <h2 className="vc-section-title vc-closing-title">
            Claim your profile. Grow your community. Own the moment.
          </h2>
          <div className="vc-closing-proof" aria-label="Platform closing highlights">
            <span>Free to start</span>
            <span>Live fan engagement</span>
            <span>Community-powered discovery</span>
          </div>
          <p className="vc-section-sub vc-closing-sub">
            Sign-up is free. Uploads are free. Your first battles are free.
            You only pay when you earn: every license sale goes 100% to you,
            and a flat 10% platform fee is itemized on every payout.
            Build your audience, host live, and turn momentum into revenue.
          </p>
          <HomeSplitCtas
            placement="closing"
            containerClassName="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
            artistClassName="studio-engage-btn rounded-md px-6 py-3 font-display text-base uppercase tracking-[0.18em]"
            listenerClassName="rounded-md studio-faceplate-dark px-6 py-3 font-display text-base uppercase tracking-[0.18em] text-white/85 hover:text-white"
          />
          <p className="mt-5 studio-label text-center text-white/55">
            Trusted payments, transparent fee disclosures, and creator-first
            ownership terms.
          </p>
        </div>
      </section>
    </div>
  );
}

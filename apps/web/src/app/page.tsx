import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { getDemoTracks } from "@/lib/demoTracks";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@ems/utils";
import { CACHE_TAGS } from "@/lib/cacheTags";
import HomeVersusRail from "@/components/HomeVersusRail";

const AudioPlayer = dynamic(() => import("@/components/LazyAudioPlayer"), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-2xl bg-white/5" />,
});

export const revalidate = 60;

export const metadata: Metadata = {
  // `absolute` opts out of the layout's `"%s | Epic Music Space"` template
  // so the home title doesn't render as "Epic Music Space — … | Epic Music Space".
  title: { absolute: "Epic Music Space — The Digital Headquarters for Music Creators" },
  description:
    "Build your profile, showcase your work, sell services, collaborate, and grow your music business. Step in the ring on Versus battles. Virtual studios and city districts coming next.",
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
  "Your Music HQ",
  "Showcase Your Work",
  "Sell Your Services",
  "Collaborate Live",
  "Versus Battles Tonight",
  "Step in the Ring",
  "From the Vault",
  "90% to the Artist",
  "Virtual Studios Coming Soon",
  "Your Music HQ",
  "Showcase Your Work",
  "Sell Your Services",
  "Collaborate Live",
  "Versus Battles Tonight",
  "Step in the Ring",
  "From the Vault",
  "90% to the Artist",
  "Virtual Studios Coming Soon",
];

const trackArtClasses = ["vc-track-art-1", "vc-track-art-2", "vc-track-art-3"];

const getHomeData = unstable_cache(
  async (): Promise<HomeData> => {
    const demoSampleSongs = mapDemoTracksToSampleSongs(await getDemoTracks());
    const emptyHomeData: HomeData = {
      songCount: 0,
      licenseCount: 0,
      totalRevenue: 0,
      sampleSongs: demoSampleSongs,
    };

    if (!hasUsableDatabaseUrl()) return emptyHomeData;
    try {
      const [songCount, licenseCount, transactionSum, sampleSongs] =
        await Promise.all([
          prisma.song.count({ where: { isActive: true } }),
          prisma.licenseToken.count({ where: { status: "ACTIVE" } }),
          prisma.transaction.aggregate({
            where: { status: "SUCCEEDED", type: "LICENSE_PURCHASE" },
            _sum: { amount: true },
          }),
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
        ]);

      return {
        songCount,
        licenseCount,
        totalRevenue: Number(transactionSum._sum.amount ?? 0),
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

export default async function HomePage() {
  const { songCount, licenseCount, totalRevenue, sampleSongs } =
    await getHomeData();

  const displayStats = [
    {
      num: songCount > 0 ? `${formatCount(songCount)}+` : "Curated",
      label: "Active Tracks",
    },
    {
      num: licenseCount > 0 ? `${formatCount(licenseCount)}+` : "Capped",
      label: "License Supply",
    },
    {
      num: totalRevenue > 0 ? formatRevenue(totalRevenue) : "90%",
      label: totalRevenue > 0 ? "Paid to Artists" : "Artist Share",
    },
    { num: "Live", label: "Studio Tools" },
  ];

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How do listening sessions work on Epic Music Space?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "You open a live audio room — like a private radio station. Press play on your album or unreleased tracks, talk between songs, take questions, and hand the mic to fans when you're ready. Family, friends, and listeners from anywhere in the world join the same room and react in real time.",
        },
      },
      {
        "@type": "Question",
        name: "How big can my listening room get?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Free studios fit a small crew so you can vibe with your closest fans. Paid tiers unlock larger rooms — up to thousands of live listeners in a single session — with priority queue control and richer host tools.",
        },
      },
      {
        "@type": "Question",
        name: "How do artists make money on Epic Music Space?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sessions, sales, and battles all feed each other. Sell licenses (you keep 90%), get tipped in live rooms, win Versus battles to climb the charts, and earn streaming royalties forever. Every fan in your room is one click from licensing the song they're hearing.",
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

  return (
    <div className="vc-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <section className="vc-hero">
        <div className="vc-stars" aria-hidden="true" />
        <Image
          className="vc-studio-photo"
          src="https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1200&q=80&auto=format&fit=crop"
          alt=""
          aria-hidden="true"
          fill
          sizes="100vw"
          priority
        />
        <div className="vc-studio-tint" aria-hidden="true" />
        <div className="vc-studio-overlay" aria-hidden="true" />
        <div className="vc-studio-scan" aria-hidden="true" />
        <div className="vc-grain" aria-hidden="true" />
        <div className="vc-grid-floor" aria-hidden="true" />
        <div className="vc-horizon" aria-hidden="true" />

        <div className="vc-hero-content">
          <p className="vc-eyebrow">The digital headquarters for music creators</p>
          <h1 className="vc-hero-h1">
            Build your profile.
            <br />
            <span className="accent">Showcase your work.</span>
            <br />
            Grow your business.
          </h1>
          <p className="vc-hero-tagline">
            Epic Music Space is where artists, producers, and engineers run their
            careers in one place — profile, catalog, services for sale, fan
            collabs, and{" "}
            <Link href="/versus" className="accent underline decoration-dotted underline-offset-4 hover:no-underline">
              live Versus battles
            </Link>{" "}
            that put your music in front of voting fans every night.
            <span className="block mt-2 text-base text-white/45">
              Virtual studios and 3D city districts ship next — claim your block
              before the doors open.
            </span>
          </p>
          <div className="vc-hero-ctas">
            <Link href="/auth/signup?role=ARTIST" className="vc-btn vc-btn-pink">
              Build Your Studio →
            </Link>
            <Link href="/versus" className="vc-btn vc-btn-ghost">
              Watch Versus Live
            </Link>
          </div>
        </div>
      </section>

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

      <section className="vc-section vc-platform-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Your music HQ</p>
          <h2 className="vc-section-title">
            One platform for your profile, your catalog, your services,
            <br />
            and the fans who back you.
          </h2>
          <p className="vc-section-sub">
            Epic Music Space is the digital headquarters where music creators
            run the whole business — claim your studio, ship your work, sell
            your services, collaborate with the room, and battle live.
            Virtual studios and 3D city districts are next.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / Profile</span>
              <h3>Claim your studio.</h3>
              <p>
                A real artist profile — bio, catalog, badges, district rank,
                social links, payouts. The page you point fans, labels, and
                supervisors to instead of pasting six different URLs.{" "}
                <Link href="/auth/signup?role=ARTIST" className="vc-feat-link">
                  Build your studio →
                </Link>
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">02 / Catalog</span>
              <h3>Showcase + license your work.</h3>
              <p>
                Upload tracks, set licensing terms in plain language, surface
                older material in The Vault, and let fans become license
                holders who share streaming revenue with you forever. You
                keep 90%.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">03 / Services</span>
              <h3>Sell mixing, mastering, beats.</h3>
              <p>
                Producers and engineers list services with clear scope,
                delivery time, and price. Fans and other artists book and
                pay through EMS. No third-party invoicing, no chasing.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">04 / Battle</span>
              <h3>Step in the ring on Versus.</h3>
              <p>
                Drop your track against another artist&apos;s. The whole room
                votes in real time, winners climb the charts overnight. This is
                how unknown artists go viral on EMS — every night, no playlist
                gatekeepers.{" "}
                <Link href="/versus" className="vc-feat-link">
                  Enter a Battle →
                </Link>
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">05 / Collaborate</span>
              <h3>Live listening rooms.</h3>
              <p>
                Open a live audio room for your album, your unreleased track,
                or a session with another artist. Talk between songs, pass
                the mic to fans, and turn listeners into license holders
                without leaving the room.
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

      <section className="vc-section vc-platform-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Artist first journey</p>
          <h2 className="vc-section-title">
            From first upload to first live room — <span className="glow">one clear path.</span>
          </h2>
          <p className="vc-section-sub">
            EMS keeps the artist setup tight: claim your studio, publish a track,
            set simple licensing terms, then invite fans into the room where the
            music is already playing.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / Studio</span>
              <h3>Claim your artist room.</h3>
              <p>
                Create your artist profile, choose your public studio URL, and
                give fans one place to follow your music. <Link href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew" className="vc-feat-link">Start as Artist →</Link>
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">02 / Upload</span>
              <h3>Publish the track.</h3>
              <p>
                Upload audio, add cover art, set genre details, and preview the
                song before it goes live. <Link href="/studio/new" className="vc-feat-link">Upload Track →</Link>
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">03 / License</span>
              <h3>Set terms fans understand.</h3>
              <p>
                Pick the license price, supply, and share shown on the track
                page so supporters know exactly what they are backing.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">04 / Go Live</span>
              <h3>Open the listening room.</h3>
              <p>
                Host the drop, talk between songs, pass the mic, and keep the
                license action one tap away while fans are still listening.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="vc-section vc-platform-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">The flagship feature</p>
          <h2 className="vc-section-title">
            Listening sessions, live —{" "}
            <span className="glow">turn every drop into an event.</span>
          </h2>
          <p className="vc-section-sub">
            Spotify, Apple, and SoundCloud are vending machines. Epic Music
            Space is a venue. You host. Your fans show up. The album plays in
            the same room as everyone in it. Comments fly, mics get passed,
            licenses sell while the music&apos;s still rolling.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / Open Doors</span>
              <h3>You&apos;re the host.</h3>
              <p>
                Spin up a session in seconds. Cue up the album, the mixtape,
                the unreleased one — whatever you&apos;re in the mood to play.
                Drop a description. Hit live.
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

      <section className="vc-section vc-leaderboard-section">
        <div className="vc-container">
          <div className="vc-lb-grid">
            <div>
              <p className="vc-section-eyebrow">Tonight&apos;s Charts</p>
              <h2 className="vc-section-title">
                Your name <span className="pink">belongs up here</span>
              </h2>
              <p className="vc-section-sub">
                Charts move with battle wins, license sales, plays, and EMS score —
                not playlist politics. Drop a track, win a battle, and watch
                yourself climb past artists with ten times your followers.
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

      <section className="vc-section vc-split-section">
        <div className="vc-container">
          <div className="vc-split-grid">
            <div className="vc-split-card artists">
              <div>
                <p className="vc-section-eyebrow vc-eyebrow-pink">
                  For Artists
                </p>
                <h3>
                  Host the room. <span className="high">Run the show.</span>
                  <br />
                  Get paid in real time.
                </h3>
                <p>
                  Open live listening sessions for fans across the world, pass
                  the mic when you want, and turn the people in your room into
                  paying license holders before they leave. Battles, charts,
                  and 90% royalties baked in.
                </p>
                <div className="vc-split-stats">
                  <div className="vc-stat">
                    <div className="num">90%</div>
                    <div className="label">Yours, Per License</div>
                  </div>
                  <div className="vc-stat">
                    <div className="num">Live</div>
                    <div className="label">Battles &amp; Drops</div>
                  </div>
                </div>
              </div>
              <Link
                href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Fstudio%2Fnew"
                className="vc-btn vc-btn-pink vc-split-cta"
              >
                Open Your Studio →
              </Link>
            </div>

            <div className="vc-split-card creators">
              <div>
                <p className="vc-section-eyebrow vc-eyebrow-cyan">
                  For Fans &amp; Creators
                </p>
                <h3>
                  Back the artist <span className="high">before</span>
                  <br />
                  the world catches on
                </h3>
                <p>
                  License a track, share in its streaming revenue forever, and
                  brag about discovering them first. Use the music in your videos,
                  your podcast, your brand — with terms shown upfront.
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

      <section className="vc-section vc-feat-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">How you win on EMS</p>
          <h2 className="vc-section-title">
            Every tool you need to <span className="glow">break out</span> —
            in one studio
          </h2>
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
              <h3>Clubhouse for music</h3>
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
              <h3>Watch your fans buy in live</h3>
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
              <h3>The AI scout in your corner</h3>
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
      <section className="vc-section">
        <div className="vc-container">
          <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/14 via-amber-500/4 to-transparent px-6 py-12 shadow-[0_30px_60px_-30px_rgba(245,158,11,0.45)] sm:px-12 sm:py-14">
            <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300">
                  The Vault · Legacy Catalogs
                </p>
                <h2 className="mt-3 text-3xl font-extrabold leading-tight text-amber-50 sm:text-4xl">
                  For the artists who&apos;ve{" "}
                  <span className="text-amber-300">been doing this for years.</span>
                </h2>
                <p className="mt-4 max-w-xl text-base text-amber-100/75">
                  Older releases. Demos that never got their moment. Records
                  that disappeared off streaming. Tag a track as legacy and it
                  lands in The Vault — a dedicated home for back-catalog work,
                  with the year on every record and the original artist front
                  and center.
                </p>
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

      <section className="vc-section vc-tracks-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Tonight&apos;s Drops</p>
          <h2 className="vc-section-title">
            Tracks moving <span className="glow">right now</span>
          </h2>
          <p className="vc-section-sub">
            Real artists, real licenses, real momentum. Hear the song,
            see the terms, watch the supply tick down — your next favorite
            artist is one of these.
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

      <section className="vc-section vc-closing-section">
        <div className="vc-container vc-closing-inner">
          <p className="vc-eyebrow">Your move</p>
          <h2 className="vc-section-title vc-closing-title">
            Claim your studio. Run your business. Battle the room.
          </h2>
          <p className="vc-section-sub vc-closing-sub">
            Sign-up is free. Uploads are free. Entering your first Versus
            battle is free. You only get charged when you sell — and when you
            sell, you keep 90%. Virtual studios and the 3D city ship next.
          </p>
          <div className="vc-hero-ctas">
            <Link href="/auth/signup?role=ARTIST" className="vc-btn vc-btn-pink">
              Build Your Studio →
            </Link>
            <Link href="/versus" className="vc-btn vc-btn-chrome">
              Step in a Versus Battle
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

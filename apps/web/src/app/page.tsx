import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import AudioPlayer from "@/components/AudioPlayer";
import { demoTracks } from "@/lib/demoTracks";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Epic Music Space - License Cinematic Tracks",
  description:
    "Preview, license, and release cinematic space, sci-fi, and game music with clear terms, capped license drops, and revenue participation.",
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

const demoSampleSongs: SampleSong[] = demoTracks.map((t) => ({
  id: t.id,
  title: t.title,
  artist: t.artist,
  genre: t.genre,
  audioUrl: t.audioUrl,
  coverUrl: t.coverUrl,
  bpm: t.bpm,
  key: t.key,
  licensePrice: t.licensePrice,
  revenueSharePct: t.revenueSharePct,
  totalLicenses: t.totalLicenses,
  soldLicenses: t.soldLicenses,
  aiScore: t.aiScore,
  description: t.description,
}));

const emptyHomeData: HomeData = {
  songCount: 0,
  licenseCount: 0,
  totalRevenue: 0,
  sampleSongs: demoSampleSongs,
};

const marqueeItems = [
  "Marketplace Drops",
  "Versus Battles",
  "District Placement",
  "Capped Licenses",
  "Artist Revenue Share",
  "AI Discovery",
  "Music City",
  "Marketplace Drops",
  "Versus Battles",
  "District Placement",
  "Capped Licenses",
  "Artist Revenue Share",
  "AI Discovery",
  "Music City",
];

const trackArtClasses = ["vc-track-art-1", "vc-track-art-2", "vc-track-art-3"];

const getHomeData = unstable_cache(
  async (): Promise<HomeData> => {
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
  ["homepage-vc-v1"],
  { revalidate: 3600 },
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

function formatPrice(value: string) {
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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
    { num: "3", label: "City Districts" },
  ];

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How does licensing work on Epic Music Space?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Each track shows transparent terms, license price, usage rights, and remaining supply before checkout so buyers can purchase with confidence.",
        },
      },
      {
        "@type": "Question",
        name: "Can artists control pricing and license supply?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Artists set pricing, license counts, and release strategy from their studio dashboard while tracking discovery and sales performance.",
        },
      },
      {
        "@type": "Question",
        name: "Do fans and creators preview tracks before purchase?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. The marketplace includes playable previews so listeners can evaluate tracks before licensing.",
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

      {/* Hero */}
      <section className="vc-hero">
        <div className="vc-stars" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="vc-studio-photo"
          src="https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=2400&q=85&auto=format&fit=crop"
          alt=""
          aria-hidden="true"
        />
        <div className="vc-studio-tint" aria-hidden="true" />
        <div className="vc-studio-overlay" aria-hidden="true" />
        <div className="vc-studio-scan" aria-hidden="true" />
        <div className="vc-grid-floor" aria-hidden="true" />
        <div className="vc-horizon" aria-hidden="true" />

        <svg
          className="vc-palm vc-palm-left"
          viewBox="0 0 200 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M100 600 C100 480 95 380 92 260" stroke="#0a0420" strokeWidth="14" strokeLinecap="round" />
          <path d="M92 260 C60 200 20 160 -20 150 C10 140 60 165 92 220" fill="#0a0420" />
          <path d="M92 260 C80 180 90 120 110 60 C105 130 110 200 92 260" fill="#0a0420" />
          <path d="M92 260 C130 200 170 170 210 165 C175 155 130 175 92 220" fill="#0a0420" />
          <path d="M92 260 C50 230 10 250 -30 270 C5 255 60 245 92 265" fill="#0a0420" />
          <path d="M92 260 C140 230 170 260 200 290 C170 270 130 255 92 265" fill="#0a0420" />
        </svg>
        <svg
          className="vc-palm vc-palm-right"
          viewBox="0 0 200 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M100 600 C100 480 95 380 92 260" stroke="#0a0420" strokeWidth="14" strokeLinecap="round" />
          <path d="M92 260 C60 200 20 160 -20 150 C10 140 60 165 92 220" fill="#0a0420" />
          <path d="M92 260 C80 180 90 120 110 60 C105 130 110 200 92 260" fill="#0a0420" />
          <path d="M92 260 C130 200 170 170 210 165 C175 155 130 175 92 220" fill="#0a0420" />
          <path d="M92 260 C50 230 10 250 -30 270 C5 255 60 245 92 265" fill="#0a0420" />
          <path d="M92 260 C140 230 170 260 200 290 C170 270 130 255 92 265" fill="#0a0420" />
        </svg>

        <div className="vc-hero-content">
          <p className="vc-eyebrow">The city where music earns its place</p>
          <h1 className="vc-hero-h1">
            Epic
            <br />
            Music
            <br />
            Space
          </h1>
          <p className="vc-hero-tagline">
            License <span className="accent">cinematic tracks</span>, back
            artists, and watch releases climb through genre districts with real
            demand.
          </p>
          <div className="vc-hero-ctas">
            <Link href="/marketplace" className="vc-btn vc-btn-pink">
              Browse Drops
            </Link>
            <Link href="/auth/signup" className="vc-btn vc-btn-ghost">
              Join the City
            </Link>
          </div>
        </div>
      </section>

      {/* Marquee */}
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

      {/* Track Cards */}
      <section className="vc-section vc-tracks-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Featured Drops</p>
          <h2 className="vc-section-title">
            Hear the cue.{" "}
            <span className="glow">See the terms.</span>
          </h2>
          <p className="vc-section-sub">
            Preview every track before you license it. Price, supply, and
            revenue share — all upfront.
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={song.coverUrl}
                        alt={song.title}
                        className="vc-track-cover-img"
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
              View Full Catalog
            </Link>
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="vc-section vc-leaderboard-section">
        <div className="vc-container">
          <div className="vc-lb-grid">
            <div>
              <p className="vc-section-eyebrow">Top Charts</p>
              <h2 className="vc-section-title">
                The <span className="pink">hottest</span> tracks in the city
              </h2>
              <p className="vc-section-sub">
                Rankings move with plays, licenses, battle wins, and district
                momentum. Real demand drives real placement.
              </p>
              <Link href="/versus" className="vc-btn vc-btn-pink">
                Enter Versus Battles
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

      {/* Split CTA */}
      <section className="vc-section vc-split-section">
        <div className="vc-container">
          <div className="vc-split-grid">
            <div className="vc-split-card creators">
              <div>
                <p className="vc-section-eyebrow vc-eyebrow-pink">
                  For Creators
                </p>
                <h3>
                  License <span className="high">cinematic</span>
                  <br />
                  music fast
                </h3>
                <p>
                  Find music that explains its price, rights, supply, and
                  revenue split before you buy. No hidden terms.
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
                className="vc-btn vc-btn-pink vc-split-cta"
              >
                Browse the Catalog
              </Link>
            </div>

            <div className="vc-split-card artists">
              <div>
                <p className="vc-section-eyebrow vc-eyebrow-cyan">
                  For Artists
                </p>
                <h3>
                  Release and <span className="high">earn</span>
                  <br />
                  on your terms
                </h3>
                <p>
                  Set price and supply, keep 90% of sales, and let real demand
                  push your release through the city.
                </p>
                <div className="vc-split-stats">
                  <div className="vc-stat">
                    <div className="num">90%</div>
                    <div className="label">Artist Share</div>
                  </div>
                  <div className="vc-stat">
                    <div className="num">3</div>
                    <div className="label">City Districts</div>
                  </div>
                </div>
              </div>
              <Link
                href="/auth/signup"
                className="vc-btn vc-btn-ghost-cyan vc-split-cta"
              >
                Open Your Studio
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="vc-section vc-feat-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Platform Features</p>
          <h2 className="vc-section-title">
            Built for the <span className="glow">next wave</span> of music
          </h2>
          <div className="vc-feat-grid vc-feat-grid-top">
            <div className="vc-feat-card">
              <span className="vc-feat-tag">Marketplace</span>
              <h3>Browse by genre, BPM &amp; score</h3>
              <p>
                Filter by genre, BPM, key, EMS score, price range, and
                remaining license supply. Hear before you buy — every time.
              </p>
              <Link href="/marketplace" className="vc-feat-link">
                Open Marketplace →
              </Link>
            </div>
            <div className="vc-feat-card versus">
              <span className="vc-feat-tag">Versus Battles</span>
              <h3>Put tracks head-to-head</h3>
              <p>
                Artists submit tracks for head-to-head battles. Community votes
                push winners up the discovery ladder and into top city
                districts.
              </p>
              <Link href="/versus" className="vc-feat-link vc-feat-link-pink">
                Enter Battles →
              </Link>
            </div>
            <div className="vc-feat-card">
              <span className="vc-feat-tag">Music City</span>
              <h3>See the city in 3D</h3>
              <p>
                Studios, district status, and release momentum visualized as a
                live 3D city. Watch your track climb floors as it gains
                traction.
              </p>
              <Link href="/city" className="vc-feat-link">
                Enter the City →
              </Link>
            </div>
            <div className="vc-feat-card versus">
              <span className="vc-feat-tag">AI Discovery</span>
              <h3>EMS score drives placement</h3>
              <p>
                Every track gets an AI-driven EMS score based on composition,
                production quality, and market fit. Scores determine district
                placement.
              </p>
              <Link
                href="/marketplace"
                className="vc-feat-link vc-feat-link-pink"
              >
                View Top Scores →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="vc-section vc-closing-section">
        <div className="vc-container vc-closing-inner">
          <p className="vc-eyebrow">Ready to move?</p>
          <h2 className="vc-section-title vc-closing-title">
            License a track or release your own before the next drop moves.
          </h2>
          <p className="vc-section-sub vc-closing-sub">
            Browsing is open. Checkout, releases, and payouts use account
            access.
          </p>
          <div className="vc-hero-ctas">
            <Link href="/marketplace" className="vc-btn vc-btn-pink">
              Browse Tracks
            </Link>
            <Link href="/auth/signup" className="vc-btn vc-btn-chrome">
              Create Account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

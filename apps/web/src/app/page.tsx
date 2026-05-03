import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import AudioPlayer from "@/components/AudioPlayer";
import { demoTracks } from "@/lib/demoTracks";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Epic Music Space - Premium Music Licensing Platform",
  description:
    "License premium music, launch curated drops, and release tracks with clear terms, capped supply, and artist revenue participation.",
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
  "Premium Licensing",
  "Studio Drops",
  "Verified Demand",
  "Capped Licenses",
  "Artist Revenue Share",
  "Creator Catalog",
  "AI Discovery",
  "Premium Licensing",
  "Studio Drops",
  "Verified Demand",
  "Capped Licenses",
  "Artist Revenue Share",
  "Creator Catalog",
  "AI Discovery",
];

const trackArtClasses = ["vc-track-art-1", "vc-track-art-2", "vc-track-art-3"];

const premiumHomeCss = `
.vc-page {
  background:
    radial-gradient(circle at 20% 0%, rgba(34, 211, 238, 0.12), transparent 30%),
    radial-gradient(circle at 80% 0%, rgba(253, 224, 71, 0.10), transparent 28%),
    #050507;
  color: #f7f7fb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.vc-page::before { display: none; }
.vc-nav {
  background: rgba(5, 5, 8, 0.72);
  border-bottom: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 18px 60px rgba(0,0,0,0.35);
}
.vc-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.22em;
  color: #fff;
  -webkit-text-fill-color: #fff;
  background: none;
  text-shadow: none;
}
.vc-logo-mark {
  margin-left: 0;
  border: 1px solid rgba(253,224,71,0.45);
  border-radius: 999px;
  padding: 4px 8px;
  color: #fde68a;
  -webkit-text-fill-color: #fde68a;
  background: rgba(253,224,71,0.10);
  font-size: 10px;
  letter-spacing: 0.14em;
}
.vc-nav-links a,
.vc-btn,
.vc-btn-ghost-cyan,
.vc-eyebrow,
.vc-section-eyebrow,
.vc-feat-tag,
.vc-feat-link,
.vc-track-genre,
.vc-track-bpm,
.vc-track-price,
.vc-track-license,
.vc-stat .label,
.vc-lb-header span,
.vc-lb-rank,
.vc-lb-streams {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
.vc-nav-links a { letter-spacing: 0.12em; color: rgba(255,255,255,0.66); }
.vc-nav-links a:hover { color: #fff; text-shadow: none; }
.vc-btn {
  border-radius: 999px;
  letter-spacing: 0.11em;
  box-shadow: none;
}
.vc-btn-pink {
  background: linear-gradient(135deg, #f7f7fb 0%, #c9cad4 52%, #f6d36f 100%);
  color: #07070b;
  box-shadow: 0 18px 48px rgba(253,224,71,0.18);
}
.vc-btn-pink:hover { box-shadow: 0 22px 70px rgba(253,224,71,0.28); }
.vc-btn-ghost,
.vc-btn-ghost-cyan {
  color: #d7faff;
  border-color: rgba(34,211,238,0.34);
  background: rgba(255,255,255,0.045);
}
.vc-btn-ghost:hover,
.vc-btn-ghost-cyan:hover {
  background: rgba(34,211,238,0.12);
  box-shadow: 0 18px 42px rgba(34,211,238,0.16);
}
.vc-hero { min-height: 100vh; background: #050507; }
.vc-studio-photo {
  opacity: 0;
  filter: brightness(0.7) contrast(1.12) saturate(1.02);
  transform: scale(1.02);
  animation:
    vc-photo-fade-in 1.6s ease-out forwards,
    vc-photo-breathe 14s ease-in-out 1.6s infinite alternate;
}
@keyframes vc-photo-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes vc-photo-breathe {
  0% { filter: brightness(0.68) contrast(1.1) saturate(0.98); transform: scale(1.02); }
  100% { filter: brightness(0.78) contrast(1.14) saturate(1.06); transform: scale(1.06); }
}
.vc-studio-tint {
  background: linear-gradient(135deg, rgba(5,5,8,0.36), rgba(11,26,31,0.26), rgba(93,72,20,0.20));
  mix-blend-mode: normal;
}
.vc-studio-overlay {
  background:
    radial-gradient(ellipse 70% 45% at 50% 82%, rgba(253,224,71,0.14), transparent 64%),
    radial-gradient(ellipse 48% 36% at 18% 16%, rgba(34,211,238,0.18), transparent 58%),
    linear-gradient(180deg, rgba(5,5,8,0.10) 0%, rgba(5,5,8,0.28) 50%, rgba(5,5,8,0.92) 100%);
}
.vc-studio-scan { opacity: 0.12; }
.vc-stars { opacity: 0.28; }
.vc-grid-floor {
  opacity: 0.20;
  background-size: 110px 110px;
  background-image:
    linear-gradient(to right, rgba(34,211,238,0.36) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(253,224,71,0.24) 1px, transparent 1px);
}
.vc-horizon {
  background: linear-gradient(90deg, transparent, rgba(34,211,238,0.55), rgba(253,224,71,0.70), rgba(34,211,238,0.55), transparent);
  box-shadow: 0 0 42px rgba(34,211,238,0.28);
}
.vc-palm { display: none !important; }
.vc-eyebrow {
  color: #d7faff;
  letter-spacing: 0.26em;
  text-shadow: none;
  animation: none;
}
.vc-hero-h1,
.vc-section-title,
.vc-track-name,
.vc-lb-track-name,
.vc-split-card h3,
.vc-feat-card h3,
.vc-stat .num {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.055em;
  text-transform: none;
}
.vc-hero-h1 {
  max-width: 960px;
  font-weight: 950;
  font-size: clamp(4.2rem, 11vw, 10rem);
  line-height: 0.9;
  background: linear-gradient(180deg, #fff 0%, #f5f5f7 38%, #d7faff 70%, #f6d36f 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 32px 90px rgba(0,0,0,0.7);
}
.vc-hero-tagline {
  max-width: 760px;
  color: rgba(255,255,255,0.78);
  line-height: 1.75;
}
.vc-hero-tagline .accent { color: #f6d36f; text-shadow: none; }
.vc-marquee {
  background: rgba(255,255,255,0.03);
  border-top: 1px solid rgba(255,255,255,0.08);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.vc-marquee-track span {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.24em;
  color: rgba(255,255,255,0.64);
  text-transform: uppercase;
}
.vc-marquee-track .dot { color: #f6d36f; text-shadow: none; }
.vc-section { padding: 112px 40px; }
.vc-section-eyebrow { color: #f6d36f; letter-spacing: 0.22em; text-shadow: none; }
.vc-section-title {
  font-size: clamp(2.4rem, 5.2vw, 4.9rem);
  font-weight: 920;
  line-height: 0.98;
}
.vc-section-title .glow,
.vc-section-title .pink { color: #d7faff; text-shadow: none; }
.vc-platform-section {
  background:
    radial-gradient(circle at 12% 10%, rgba(34,211,238,0.10), transparent 32%),
    linear-gradient(180deg, #050507 0%, #090910 100%);
}
.vc-platform-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin-top: 48px;
}
.vc-platform-card,
.vc-track-card,
.vc-lb-table,
.vc-split-card,
.vc-feat-card {
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035));
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 28px 90px rgba(0,0,0,0.30);
}
.vc-platform-card {
  min-height: 260px;
  padding: 34px;
  position: relative;
  overflow: hidden;
}
.vc-platform-card::after {
  content: '';
  position: absolute;
  inset: auto -18% -32% 30%;
  height: 160px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(34,211,238,0.20), transparent 70%);
}
.vc-platform-num {
  color: #f6d36f;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.vc-platform-card h3 {
  margin-top: 28px;
  font-size: 28px;
  line-height: 1.02;
  letter-spacing: -0.04em;
  font-weight: 900;
}
.vc-platform-card p {
  margin-top: 18px;
  color: rgba(255,255,255,0.60);
  line-height: 1.65;
}
.vc-tracks-section,
.vc-leaderboard-section,
.vc-split-section,
.vc-feat-section {
  background:
    radial-gradient(circle at 70% 20%, rgba(34,211,238,0.08), transparent 34%),
    #050507;
}
.vc-track-card { padding: 22px; border-radius: 26px; }
.vc-track-card:hover { box-shadow: 0 32px 90px rgba(34,211,238,0.16); border-color: rgba(253,224,71,0.28); }
.vc-track-art { border-radius: 18px; }
.vc-track-name { font-weight: 900; letter-spacing: -0.04em; }
.vc-lb-row { color: inherit; text-decoration: none; }
.vc-lb-track-name { font-weight: 850; font-size: 18px; }
.vc-lb-rank, .vc-lb-row.top1 .vc-lb-rank, .vc-lb-row.top2 .vc-lb-rank, .vc-lb-row.top3 .vc-lb-rank { color: #f6d36f; text-shadow: none; }
.vc-split-card h3 { font-size: clamp(2.3rem, 4vw, 3.7rem); font-weight: 930; }
.vc-feat-card h3 { font-size: 34px; font-weight: 900; }
.vc-feat-tag { color: #f6d36f; background: rgba(253,224,71,0.10); border-color: rgba(253,224,71,0.24); }
.vc-feat-card.versus .vc-feat-tag { color: #d7faff; background: rgba(34,211,238,0.10); border-color: rgba(34,211,238,0.24); }
@media (max-width: 900px) {
  .vc-platform-grid { grid-template-columns: 1fr; }
  .vc-section { padding: 84px 22px; }
}
`;

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
  ["homepage-premium-studio-v1"],
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
    { num: "Live", label: "Studio Tools" },
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
      <style dangerouslySetInnerHTML={{ __html: premiumHomeCss }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <nav className="vc-nav" aria-label="Primary">
        <Link href="/" className="vc-logo" aria-label="Epic Music Space Home">
          EPIC MUSIC SPACE <span className="vc-logo-mark">EMS</span>
        </Link>
        <div className="vc-nav-links">
          <Link href="/marketplace">Marketplace</Link>
          <Link href="/leaderboard">Charts</Link>
          <Link href="/versus">Versus</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div className="vc-nav-cta">
          <Link href="/auth/signin" className="vc-btn vc-btn-ghost vc-btn-nav">
            Sign In
          </Link>
          <Link href="/auth/signup" className="vc-btn vc-btn-pink vc-btn-nav">
            Get Started
          </Link>
        </div>
      </nav>

      <section className="vc-hero">
        <div className="vc-stars" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="vc-studio-photo"
          src="https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=2600&q=85&auto=format&fit=crop"
          alt=""
          aria-hidden="true"
        />
        <div className="vc-studio-tint" aria-hidden="true" />
        <div className="vc-studio-overlay" aria-hidden="true" />
        <div className="vc-studio-scan" aria-hidden="true" />
        <div className="vc-grid-floor" aria-hidden="true" />
        <div className="vc-horizon" aria-hidden="true" />

        <div className="vc-hero-content">
          <p className="vc-eyebrow">Premium music licensing for creators and artists</p>
          <h1 className="vc-hero-h1">
            Epic
            <br />
            Music
            <br />
            Space
          </h1>
          <p className="vc-hero-tagline">
            License <span className="accent">premium tracks</span>, back artists,
            and watch releases rise through charts, curated drops, and verified
            demand.
          </p>
          <div className="vc-hero-ctas">
            <Link href="/marketplace" className="vc-btn vc-btn-pink">
              Browse Catalog
            </Link>
            <Link href="/auth/signup" className="vc-btn vc-btn-ghost">
              Open Your Studio
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

      <section className="vc-section vc-platform-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">The Platform</p>
          <h2 className="vc-section-title">
            A premium studio layer for music licensing, release strategy, and
            artist monetization.
          </h2>
          <p className="vc-section-sub">
            Epic Music Space opens as a serious music-tech platform first. The
            immersive world can return later after the product, catalog, and
            creator economy are fully connected.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / License</span>
              <h3>Clear rights before checkout.</h3>
              <p>
                Creators preview tracks, review price, supply, and usage terms,
                then license music with confidence instead of guessing.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">02 / Release</span>
              <h3>Artists control the drop.</h3>
              <p>
                Artists set pricing, supply, and release strategy while tracking
                demand, sales, and marketplace momentum from their studio.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">03 / Grow</span>
              <h3>Visibility follows demand.</h3>
              <p>
                Charts, battles, scores, and placements turn attention into a
                measurable system artists can build around.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="vc-section vc-leaderboard-section">
        <div className="vc-container">
          <div className="vc-lb-grid">
            <div>
              <p className="vc-section-eyebrow">Top Charts</p>
              <h2 className="vc-section-title">
                The <span className="pink">hottest</span> tracks on the platform
              </h2>
              <p className="vc-section-sub">
                Rankings move with plays, licenses, battle wins, and marketplace
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

      <section className="vc-section vc-split-section">
        <div className="vc-container">
          <div className="vc-split-grid">
            <div className="vc-split-card creators">
              <div>
                <p className="vc-section-eyebrow vc-eyebrow-pink">
                  For Creators
                </p>
                <h3>
                  License <span className="high">premium</span>
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
                  Set price and supply, keep 90% of sales, and let verified
                  demand push your release through the platform.
                </p>
                <div className="vc-split-stats">
                  <div className="vc-stat">
                    <div className="num">90%</div>
                    <div className="label">Artist Share</div>
                  </div>
                  <div className="vc-stat">
                    <div className="num">Live</div>
                    <div className="label">Studio Tools</div>
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
                push winners up the discovery ladder and into top placements.
              </p>
              <Link href="/versus" className="vc-feat-link vc-feat-link-pink">
                Enter Battles →
              </Link>
            </div>
            <div className="vc-feat-card">
              <span className="vc-feat-tag">Studio Network</span>
              <h3>Build your release hub</h3>
              <p>
                Studio dashboards, rankings, and release momentum appear as
                premium platform surfaces now. The immersive world returns when
                the VR layer is ready.
              </p>
              <Link href="/auth/signup" className="vc-feat-link">
                Open Studio →
              </Link>
            </div>
            <div className="vc-feat-card versus">
              <span className="vc-feat-tag">AI Discovery</span>
              <h3>EMS score informs placement</h3>
              <p>
                Every track gets an AI-driven EMS score based on composition,
                production quality, and market fit. Scores inform marketplace
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

      <section className="vc-section vc-tracks-section">
        <div className="vc-container">
          <p className="vc-section-eyebrow">Featured Studio Drops</p>
          <h2 className="vc-section-title">
            Hear the cue. <span className="glow">See the terms.</span>
          </h2>
          <p className="vc-section-sub">
            Preview every track before you license it. Price, supply, and
            revenue share are shown upfront.
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

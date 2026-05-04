import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import Image from "next/image";
import AudioPlayer from "@/components/AudioPlayer";
import { getDemoTracks } from "@/lib/demoTracks";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@ems/utils";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Epic Music Space — Live Listening Parties for Artists & Their Fans",
  description:
    "Host live listening sessions for your fans, family, and friends across the world. Play your album, talk between tracks, take live questions, and turn drops into events. Battles, licensing, and royalties built in.",
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
  "Live Listening Parties",
  "Drop Your Album Live",
  "Take the Floor",
  "Versus Battles",
  "90% to the Artist",
  "Fans Hold Your Catalog",
  "Climb the Charts",
  "Live Listening Parties",
  "Drop Your Album Live",
  "Take the Floor",
  "Versus Battles",
  "90% to the Artist",
  "Fans Hold Your Catalog",
  "Climb the Charts",
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
  filter: brightness(0.28) contrast(1.28) saturate(0.65) hue-rotate(10deg);
  transform: scale(1.10);
  animation:
    vc-photo-fade-in 3.8s cubic-bezier(0.16, 1, 0.3, 1) forwards,
    vc-photo-breathe 22s ease-in-out 3.8s infinite alternate;
}
@keyframes vc-photo-fade-in {
  0%   { opacity: 0;   transform: scale(1.10); filter: brightness(0.20) contrast(1.32) saturate(0.55) hue-rotate(14deg); }
  60%  { opacity: 0.7; }
  100% { opacity: 1;   transform: scale(1.03); filter: brightness(0.50) contrast(1.18) saturate(0.82) hue-rotate(6deg); }
}
@keyframes vc-photo-breathe {
  0%   { filter: brightness(0.48) contrast(1.16) saturate(0.80) hue-rotate(5deg); transform: scale(1.03); }
  100% { filter: brightness(0.56) contrast(1.22) saturate(0.88) hue-rotate(8deg); transform: scale(1.06); }
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
        <Image
          className="vc-studio-photo"
          src="https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=2600&q=90&auto=format&fit=crop&crop=center"
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
          <p className="vc-eyebrow">Live listening parties for the streaming era</p>
          <h1 className="vc-hero-h1">
            Throw a
            <br />
            listening party.
            <br />
            Anywhere.
          </h1>
          <p className="vc-hero-tagline">
            Press play on your <span className="accent">album, unreleased track, or whole catalog</span>,
            and talk between songs while fans, family, and friends from across the world
            sit in the same room with you. Hand them the mic when you&apos;re ready.
            Every listener is one click from licensing your music.
          </p>
          <div className="vc-hero-ctas">
            <Link href="/auth/signup?role=ARTIST" className="vc-btn vc-btn-pink">
              Host Your First Session →
            </Link>
            <Link href="/studio/live" className="vc-btn vc-btn-ghost">
              Drop Into a Room
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
          <p className="vc-section-eyebrow">What you can do here</p>
          <h2 className="vc-section-title">
            Built so independent artists win — without a label, without
            permission, without waiting.
          </h2>
          <p className="vc-section-sub">
            EMS gives you the tools the majors keep behind closed doors —
            live audio rooms, licensing, distribution, fan investment, and
            a stage to perform on every single night.
          </p>
          <div className="vc-platform-grid">
            <article className="vc-platform-card">
              <span className="vc-platform-num">01 / Host</span>
              <h3>Open a live listening room.</h3>
              <p>
                Your studio is a live audio space — like a club, a radio booth,
                and a record release party in one. You press play, you talk
                between tracks, you pass the mic to fans when they raise a hand.
                Every listener in the world is sitting in the same room as you.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">02 / Battle</span>
              <h3>Step in the ring on Versus.</h3>
              <p>
                Drop your track against another artist&apos;s. Fans vote in
                real time, winners climb the charts overnight. This is how
                unknown artists go viral on EMS — every night, no playlist
                gatekeepers, no cosigns required.
              </p>
            </article>
            <article className="vc-platform-card">
              <span className="vc-platform-num">03 / Get Paid</span>
              <h3>Keep 90% of every license.</h3>
              <p>
                Every license sold during your session pays out instantly.
                Fans become license holders who share in your streaming revenue —
                so they win when you win, and they push your tracks harder
                than any marketing team.
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
            <Link href="/auth/signup?role=ARTIST" className="vc-btn vc-btn-pink">
              Host Your First Session →
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
              <Link href="/auth/signup?role=ARTIST" className="vc-btn vc-btn-pink">
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
                href="/auth/signup?role=ARTIST"
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
              <span className="vc-feat-tag">Live Listening Sessions</span>
              <h3>The flagship — Clubhouse for music</h3>
              <p>
                Open a live audio room. Press play on your album, your unreleased
                track, your back catalog. Talk between songs. Read the chat. Hand
                the mic to fans when they raise a hand. Family across the country,
                fans on the other side of the world — all in the same room with
                you, hearing it together. Subscription tier sets your room size,
                from intimate listening parties to thousand-strong releases.
              </p>
              <Link href="/studio/live" className="vc-feat-link vc-feat-link-pink">
                See Live Rooms →
              </Link>
            </div>
            <div className="vc-feat-card">
              <span className="vc-feat-tag">Versus Battles</span>
              <h3>Step in the ring tonight</h3>
              <p>
                Drop your track against another artist&apos;s. Fans watch live,
                vote in real time, and the winner climbs the charts overnight.
                The fastest way to go viral on EMS — no playlist gatekeepers,
                no cosigns required.
              </p>
              <Link href="/versus" className="vc-feat-link">
                Enter a Battle →
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
            Open a room. Press play. Watch the world show up.
          </h2>
          <p className="vc-section-sub vc-closing-sub">
            Sign-up is free. Uploads are free. Hosting your first listening
            session is free. You only get charged when you sell — and when
            you sell, you keep 90%.
          </p>
          <div className="vc-hero-ctas">
            <Link href="/auth/signup?role=ARTIST" className="vc-btn vc-btn-pink">
              Host Your First Session →
            </Link>
            <Link href="/studio/live" className="vc-btn vc-btn-chrome">
              Drop Into a Live Room
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

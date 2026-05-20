"use client";

import Link from "next/link";
import EMSScene3D from "@/components/EMSScene3D";

const worldCards = [
  { title: "Studio", body: "Record, arrange, mix, and save sessions in your own creative room.", href: "/studio/try", icon: "🎙️" },
  { title: "Beats", body: "Browse sounds, build patterns, open the piano roll, and cook with producers.", href: "/studio/beat-machine", icon: "🥁" },
  { title: "Marketplace", body: "Sell beats, kits, services, licenses, templates, and creative work.", href: "/marketplace", icon: "💿" },
  { title: "Events", body: "Host listening rooms, battles, drops, and performance moments.", href: "/events", icon: "🌃" },
];

const lanes = [
  ["Artists", "Upload music, host rooms, sell licenses, and grow fans.", "/auth/signup?role=ARTIST"],
  ["Producers", "Sell beats, kits, loops, templates, and collaboration work.", "/marketplace"],
  ["Engineers", "Offer mixing, mastering, tuning, and session services.", "/services"],
  ["Fans", "Discover songs, vote, follow, and support creators early.", "/explore"],
] as const;

const trustPoints = [
  "Artists keep their masters",
  "Clear licensing terms",
  "Secure creator sessions",
  "Built for music creators",
];

function BassWaveform() {
  return (
    <div className="absolute inset-x-0 bottom-0 z-[2] flex h-32 items-end justify-center gap-1 opacity-75 sm:h-44" aria-hidden="true">
      {Array.from({ length: 96 }, (_, index) => {
        const height = 14 + ((index * 31) % 92) + Math.sin(index / 3) * 22;
        return (
          <span
            key={index}
            className="ems-home-wave block w-1 rounded-full bg-cyan-300/55 shadow-[0_0_14px_rgba(34,211,238,.7)]"
            style={{ height: `${Math.max(10, height)}px`, animationDelay: `${index * 22}ms` }}
          />
        );
      })}
    </div>
  );
}

function PerformanceBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,45,146,.18),transparent_25%),radial-gradient(circle_at_20%_45%,rgba(34,211,238,.18),transparent_28%),linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.94))]" />
      <div className="absolute inset-x-[-10%] top-[-8%] h-[58vh] rotate-[-3deg] bg-[linear-gradient(110deg,transparent_0%,rgba(34,211,238,.26)_18%,transparent_34%,rgba(255,45,146,.22)_55%,transparent_70%,rgba(253,224,71,.17)_88%,transparent_100%)] blur-xl" />
      <div className="absolute left-[5%] top-[18%] h-[52vh] w-[28vw] min-w-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.22),rgba(255,45,146,.14)_32%,transparent_68%)] blur-2xl" />
      <div className="absolute right-[8%] top-[18%] h-[48vh] w-[30vw] min-w-[220px] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,.2),rgba(34,211,238,.1)_38%,transparent_72%)] blur-2xl" />
      <div className="absolute bottom-[17%] left-[7%] hidden h-[56vh] w-[20vw] min-w-[210px] opacity-45 sm:block">
        <div className="absolute bottom-0 left-1/2 h-[42%] w-[35%] -translate-x-1/2 rounded-t-full bg-black/80 shadow-[0_0_48px_rgba(255,45,146,.25)]" />
        <div className="absolute bottom-[36%] left-1/2 h-[17%] w-[22%] -translate-x-1/2 rounded-full bg-black/90" />
        <div className="absolute bottom-[60%] left-[56%] h-[30%] w-[4px] rotate-[-13deg] rounded-full bg-cyan-200/45 shadow-[0_0_18px_rgba(34,211,238,.8)]" />
        <div className="absolute bottom-[69%] left-[62%] h-4 w-20 rounded-full bg-white/55 shadow-[0_0_20px_rgba(255,255,255,.65)]" />
      </div>
      <div className="absolute bottom-[14%] right-[6%] hidden h-[52vh] w-[26vw] min-w-[260px] opacity-40 lg:block">
        <div className="absolute bottom-0 h-[46%] w-full rounded-t-[3rem] border border-cyan-300/20 bg-black/70 shadow-[inset_0_0_40px_rgba(34,211,238,.12)]" />
        <div className="absolute bottom-[34%] left-[7%] h-[18%] w-[38%] rounded-xl border border-white/10 bg-cyan-300/10" />
        <div className="absolute bottom-[34%] right-[7%] h-[18%] w-[38%] rounded-xl border border-white/10 bg-pink-300/10" />
        <div className="absolute bottom-[48%] left-[18%] h-[24%] w-[64%] rounded-t-3xl border border-yellow-300/10 bg-black/85" />
      </div>
      <div className="absolute inset-x-0 bottom-[13%] flex justify-center gap-3 opacity-35">
        {Array.from({ length: 34 }, (_, index) => (
          <span key={index} className="block rounded-t-full bg-black/90" style={{ width: `${10 + (index % 4) * 2}px`, height: `${30 + ((index * 17) % 68)}px` }} />
        ))}
      </div>
    </div>
  );
}

export default function SimplifiedHomePage() {
  function playIntro() {
    window.dispatchEvent(new Event("ems:open-world-intro"));
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030307] text-white">
      <section className="relative isolate min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
        <PerformanceBackdrop />
        <BassWaveform />
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(0,0,0,.94),rgba(0,0,0,.42)_48%,rgba(0,0,0,.88)),radial-gradient(circle_at_50%_52%,transparent_0%,rgba(0,0,0,.24)_48%,rgba(0,0,0,.82)_100%)]" aria-hidden="true" />
        <div className="absolute left-1/2 top-1/2 z-[1] h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/15 shadow-[0_0_120px_rgba(34,211,238,.2),inset_0_0_90px_rgba(255,45,146,.08)]" aria-hidden="true" />
        <div className="absolute left-1/2 top-1/2 z-[1] h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-pink-300/15 shadow-[0_0_90px_rgba(255,45,146,.18)]" aria-hidden="true" />

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col justify-center">
          <nav className="absolute left-0 right-0 top-0 flex items-center justify-between gap-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-white/50">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-cyan-100">EMS</span>
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/studio/try" className="rounded-full border border-white/10 bg-white/[.04] px-3 py-2 hover:border-cyan-300/35 hover:text-cyan-100">Studio</Link>
              <Link href="/marketplace" className="rounded-full border border-white/10 bg-white/[.04] px-3 py-2 hover:border-pink-300/35 hover:text-pink-100">Marketplace</Link>
              <Link href="/explore" className="rounded-full border border-white/10 bg-white/[.04] px-3 py-2 hover:border-yellow-300/35 hover:text-yellow-100">Explore</Link>
            </div>
          </nav>

          <div className="grid items-center gap-8 pt-20 lg:grid-cols-[1.05fr_.95fr]">
            <div className="max-w-3xl">
              <p className="mb-4 inline-flex rounded-full border border-pink-300/25 bg-pink-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.34em] text-pink-100">
                A world built for music
              </p>
              <h1 className="font-display text-5xl uppercase leading-[0.86] tracking-[0.04em] text-white drop-shadow-[0_0_32px_rgba(34,211,238,.28)] sm:text-7xl lg:text-8xl xl:text-9xl">
                Enter the music space.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
                Step inside a creator universe where artists perform, producers build, engineers mix, fans discover, and every room feels like music is happening right now.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/studio/try" className="group inline-flex min-h-14 items-center justify-center rounded-full border border-cyan-300/55 bg-cyan-300/16 px-8 py-4 text-center font-display text-sm uppercase tracking-[0.24em] text-cyan-100 shadow-[0_0_38px_rgba(34,211,238,.24)] transition hover:scale-[1.02] hover:bg-cyan-300/25">
                  Enter the Space <span className="ml-2 transition group-hover:translate-x-1">→</span>
                </Link>
                <button
                  type="button"
                  onClick={playIntro}
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-yellow-200/35 bg-yellow-200/10 px-8 py-4 text-center font-display text-sm uppercase tracking-[0.24em] text-yellow-100 transition hover:scale-[1.02] hover:bg-yellow-200/18"
                >
                  3D intro + sound
                </button>
                <Link href="/marketplace" className="inline-flex min-h-14 items-center justify-center rounded-full border border-pink-300/35 bg-pink-300/10 px-8 py-4 text-center font-display text-sm uppercase tracking-[0.24em] text-pink-100 transition hover:scale-[1.02] hover:bg-pink-300/18">
                  Hear the Marketplace
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-2" aria-label="Platform trust points">
                {trustPoints.map((point) => (
                  <span key={point} className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white/62 backdrop-blur">
                    {point}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-[560px]">
              <div className="ems-home-portal absolute inset-0 rounded-full border border-cyan-300/30 bg-[radial-gradient(circle,rgba(34,211,238,.16),rgba(255,45,146,.08)_42%,transparent_68%)] shadow-[0_0_110px_rgba(34,211,238,.25),inset_0_0_90px_rgba(255,255,255,.05)]" />
              <EMSScene3D variant="home" className="absolute inset-[-10%] rounded-full opacity-90" />
              <button
                type="button"
                onClick={playIntro}
                className="absolute inset-[26%] grid place-items-center rounded-full border border-yellow-300/25 bg-black/50 text-white shadow-[0_0_50px_rgba(253,224,71,.18),inset_0_0_52px_rgba(255,255,255,.05)] backdrop-blur-sm transition hover:scale-[1.02] hover:border-yellow-200/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-200"
                aria-label="Play Epic Music Space 3D intro with sound"
              >
                <div className="text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.42em] text-cyan-200/75">Portal</p>
                  <p className="mt-2 font-display text-6xl font-black uppercase tracking-[0.08em] text-white drop-shadow-[0_0_28px_rgba(255,255,255,.45)]">EMS</p>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.28em] text-pink-200/75">Press for sound</p>
                </div>
              </button>
              <div className="absolute left-[8%] top-[12%] h-14 w-14 rounded-full border border-cyan-300/25 bg-cyan-300/12 blur-[1px]" />
              <div className="absolute bottom-[14%] right-[10%] h-20 w-20 rounded-full border border-pink-300/25 bg-pink-300/10 blur-[1px]" />
            </div>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {worldCards.map((item, index) => (
              <Link key={item.title} href={item.href} className="ems-home-card group rounded-2xl border border-white/10 bg-black/42 p-5 shadow-[0_0_34px_rgba(0,0,0,.28)] backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-white/[.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" style={{ animationDelay: `${index * 90}ms` }}>
                <span className="text-3xl">{item.icon}</span>
                <h2 className="mt-3 font-display text-2xl uppercase tracking-wide text-white">{item.title}</h2>
                <p className="mt-3 min-h-20 text-sm leading-6 text-white/62">{item.body}</p>
                <p className="mt-4 text-sm font-black uppercase tracking-widest text-cyan-200 group-hover:text-cyan-100">Enter {item.title} →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,0,0,.9))] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="studio-label text-tube-300">Choose your lane</p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              Every creator enters a different room.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/62">
              EMS should feel like a living music platform: artist stages, producer rooms, engineering suites, marketplaces, and fan discovery all connected.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {lanes.map(([title, body, href]) => (
              <Link key={title} href={href} className="rounded-xl border border-white/10 bg-black/35 p-5 transition hover:border-tube-300/50 hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
                <h3 className="font-display text-xl uppercase tracking-wide text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 lg:px-8">
        <p className="studio-label text-tube-300">Built like a world</p>
        <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
          Open the studio. Make the record. Build the business.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/62">
          The front page now leads with performance energy, studio atmosphere, neon identity, and clear creator destinations — not generic software cards.
        </p>
        <Link href="/studio/try" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full border border-cyan-300/55 bg-cyan-300/16 px-8 py-3 text-center font-display text-base uppercase tracking-[0.22em] text-cyan-100 shadow-[0_0_32px_rgba(34,211,238,.22)] transition hover:scale-[1.02] hover:bg-cyan-300/24">
          Enter the Space
        </Link>
      </section>

      <style jsx>{`
        .ems-home-wave {
          animation: ems-wave-pulse 1.15s ease-in-out infinite alternate;
          transform-origin: bottom;
        }
        .ems-home-portal {
          animation: ems-portal-spin 8s linear infinite, ems-portal-breathe 2.8s ease-in-out infinite;
        }
        .ems-home-card {
          animation: ems-card-float 4.5s ease-in-out infinite alternate;
        }
        @keyframes ems-wave-pulse {
          from { transform: scaleY(.38); opacity: .26; }
          to { transform: scaleY(1.04); opacity: .85; }
        }
        @keyframes ems-portal-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ems-portal-breathe {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.35); }
        }
        @keyframes ems-card-float {
          from { transform: translateY(0); }
          to { transform: translateY(-8px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ems-home-wave,
          .ems-home-portal,
          .ems-home-card {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}

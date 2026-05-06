import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getArRadar } from "@/lib/arRadar";

export const metadata: Metadata = {
  title: "A&R Radar",
  description:
    "Find artists gaining real traction before they hit the obvious charts.",
};

const signalStyles = {
  heating: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  breakout: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  undervalued: "border-yellow-300/30 bg-yellow-300/10 text-yellow-200",
};

export default async function RadarPage() {
  const artists = await getArRadar();
  const leader = artists[0];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 text-white">
      <header className="mb-8 border-b border-white/10 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-accent-300">
          A&amp;R Radar
        </p>
        <div className="mt-3 grid gap-5 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
          <div>
            <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">
              Artists moving before the charts catch up.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Ranked from recent plays, saves, shares, licenses, battle wins, AI score,
              and low-exposure upside. Refreshes every five minutes.
            </p>
          </div>
          {leader && (
            <div className="border-l border-white/10 pl-5">
              <p className="text-xs uppercase tracking-widest text-white/35">Top signal</p>
              <Link
                href={leader.username ? `/u/${leader.username}` : "/marketplace"}
                className="mt-2 block text-2xl font-black hover:text-accent-200"
              >
                {leader.artistName}
              </Link>
              <p className="mt-1 text-sm text-white/45">
                Score {Math.round(leader.radarScore)} · {leader.recentPlays} recent plays
              </p>
            </div>
          )}
        </div>
      </header>

      {artists.length === 0 ? (
        <section className="py-16 text-center">
          <h2 className="text-xl font-bold">Radar is waiting for live artist data.</h2>
          <p className="mt-2 text-sm text-white/45">
            Uploads, plays, saves, shares, and licenses will fill this surface.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-white/10">
          <div className="grid grid-cols-[56px_1.3fr_0.7fr_0.7fr_0.8fr] gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold uppercase tracking-widest text-white/45 max-md:hidden">
            <span>Rank</span>
            <span>Artist</span>
            <span>Signal</span>
            <span>Momentum</span>
            <span>Top track</span>
          </div>
          <div className="divide-y divide-white/8">
            {artists.map((artist, index) => (
              <article
                key={artist.artistId}
                className="grid gap-4 px-4 py-4 transition hover:bg-white/[0.035] md:grid-cols-[56px_1.3fr_0.7fr_0.7fr_0.8fr] md:items-center"
              >
                <div className="font-mono text-sm text-white/45">#{index + 1}</div>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-md bg-white/8">
                    {artist.image ? (
                      <Image src={artist.image} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm font-black text-white/40">
                        {artist.artistName.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={artist.username ? `/u/${artist.username}` : "/marketplace"}
                      className="truncate text-base font-bold hover:text-accent-200"
                    >
                      {artist.artistName}
                    </Link>
                  <p className="mt-0.5 text-xs text-white/40">
                    {artist.trackCount} tracks · AI {Math.round(artist.avgAiScore)}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {artist.why.length > 0 ? artist.why.join(" · ") : "Ranked from early marketplace and audience signals"}
                  </p>
                </div>
              </div>
                <div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${signalStyles[artist.signal]}`}
                  >
                    {artist.signal}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span><b className="text-white">{artist.recentPlays}</b><br />plays</span>
                  <span><b className="text-white">{artist.recentSaves}</b><br />saves</span>
                  <span><b className="text-white">{artist.recentLicenses}</b><br />licenses</span>
                </div>
                <div className="min-w-0 text-sm">
                  {artist.topTrack ? (
                    <Link href={`/track/${artist.topTrack.id}`} className="block truncate font-semibold hover:text-accent-200">
                      {artist.topTrack.title}
                    </Link>
                  ) : (
                    <span className="text-white/35">No track</span>
                  )}
                  <p className="mt-0.5 text-xs text-white/40">
                    Radar score {Math.round(artist.radarScore)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

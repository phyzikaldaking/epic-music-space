import Link from "next/link";
import { notFound } from "next/navigation";
import { featuredCreatorProfile, profileFeatureBlocks } from "@/lib/emsCreatorProfiles";

const creators = {
  phyzikaldaking: featuredCreatorProfile,
  bariee: {
    ...featuredCreatorProfile,
    handle: "@Bariee",
    displayName: "Bariee",
    role: "Artist / Songwriter",
    city: "Atlanta, GA",
    heroTagline: "Melodic rap, R&B energy, live listening rooms, and fan-first drops inside EMS.",
    status: "Previewing new records",
    stats: [
      { label: "Songs", value: "42" },
      { label: "Sessions", value: "11" },
      { label: "Fans", value: "5.6K" },
      { label: "Drops", value: "8" },
    ],
  },
  thural: {
    ...featuredCreatorProfile,
    handle: "@Thural",
    displayName: "Thural",
    role: "Artist / Producer",
    city: "Fort Wayne, IN",
    heroTagline: "West Coast strategy, Midwest roots, creator alliances, and original music energy.",
    status: "Building a creator alliance",
  },
};

type ArtistPageProps = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: ArtistPageProps) {
  const { handle } = await params;
  const profile = creators[handle.toLowerCase() as keyof typeof creators];
  if (!profile) return { title: "Artist Not Found | Epic Music Space" };
  return {
    title: `${profile.displayName} | Epic Music Space`,
    description: profile.heroTagline,
    openGraph: {
      title: `${profile.displayName} on Epic Music Space`,
      description: profile.heroTagline,
      type: "profile",
    },
  };
}

export default async function ArtistProfilePage({ params }: ArtistPageProps) {
  const { handle } = await params;
  const profile = creators[handle.toLowerCase() as keyof typeof creators];
  if (!profile) notFound();

  return (
    <main id="main-content" data-page="artist-profile" className="ems-page-scroll-surface min-h-screen overflow-visible px-4 py-24 text-white sm:px-6 lg:px-8">
      <section className="mx-auto min-w-[1120px] max-w-7xl overflow-visible rounded-[34px] border border-cyan-300/20 bg-[#070711]/88 p-4 shadow-[0_0_70px_rgba(0,245,255,.14)]">
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-fuchsia-950/70 via-cyan-950/40 to-black p-6">
          <div className="absolute inset-0 opacity-35 [background:radial-gradient(circle_at_20%_20%,rgba(255,45,146,.45),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(34,211,238,.38),transparent_30%),linear-gradient(135deg,rgba(255,255,255,.08),transparent)]" />
          <div className="relative grid gap-6 lg:grid-cols-[220px_1fr_260px]">
            <div className="rounded-[28px] border border-pink-300/30 bg-black/45 p-4 text-center shadow-[0_0_45px_rgba(255,45,146,.18)]">
              <div className="mx-auto grid h-36 w-36 place-items-center rounded-full border-4 border-cyan-200/70 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-400 text-5xl font-black shadow-[0_0_35px_rgba(34,211,238,.35)]">
                {profile.displayName.slice(0, 1)}
              </div>
              <p className="mt-4 text-xs font-black uppercase tracking-[0.24em] text-emerald-200">● Online now</p>
              <p className="mt-2 text-sm text-white/55">{profile.status}</p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-200/75">{profile.handle}</p>
              <h1 className="mt-2 text-6xl font-black uppercase tracking-tight sm:text-8xl">{profile.displayName}</h1>
              <p className="mt-3 text-xl font-bold text-pink-100">{profile.role}</p>
              <p className="mt-2 text-sm uppercase tracking-[0.22em] text-white/45">{profile.city}</p>
              <p className="mt-5 max-w-3xl text-lg text-white/68">{profile.heroTagline}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {profile.links.map((link) => <Link key={link.label} href={link.href} className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-white/80 hover:border-cyan-200/50 hover:text-cyan-100">{link.label}</Link>)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {profile.stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-black/40 p-4 text-center">
                  <div className="text-3xl font-black text-cyan-100">{stat.value}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/45 p-2 text-xs font-black uppercase tracking-widest text-white/55">
          {['Wall','Music','Sessions','Marketplace','Studio','Media','Friends','About'].map((tab) => <a key={tab} href={`#${tab.toLowerCase()}`} className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2 hover:border-pink-200/50 hover:text-pink-100">{tab}</a>)}
        </nav>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <section id="wall" className="rounded-3xl border border-white/10 bg-white/[.035] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black uppercase tracking-wider">Wall</h2>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-100">MySpace Mode</span>
            </div>
            <div className="mt-4 rounded-2xl border border-pink-300/20 bg-black/35 p-4">
              <textarea aria-label="Post to wall" placeholder={`Write on ${profile.displayName}'s wall...`} className="min-h-24 w-full resize-none rounded-xl border border-white/10 bg-black/55 p-3 text-sm outline-none ring-cyan-300/20 focus:ring-2" />
              <div className="mt-3 flex justify-end"><button className="rounded-full border border-pink-300/40 bg-pink-300/15 px-4 py-2 text-xs font-black uppercase tracking-widest text-pink-100">Post</button></div>
            </div>
            <div className="mt-4 grid gap-3">
              {profile.wallPosts.map((post) => (
                <article key={`${post.author}-${post.time}`} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-cyan-100">{post.author}</b>
                    <span className="text-[10px] uppercase tracking-widest text-white/35">{post.time}</span>
                  </div>
                  <p className="mt-2 text-white/70">{post.body}</p>
                  <div className="mt-3 flex gap-2 text-[10px] font-black uppercase tracking-widest text-white/45">
                    <button>Like</button><button>Comment</button><button>Repost</button><button>Tip</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="grid gap-4">
            <section id="music" className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5 shadow-[0_0_35px_rgba(34,211,238,.12)]">
              <h2 className="text-2xl font-black uppercase tracking-wider">Profile Player</h2>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Now playing</p>
                <h3 className="mt-1 text-xl font-black">{profile.music[0].title}</h3>
                <div className="mt-4 flex h-16 items-end gap-1 rounded-xl border border-white/10 bg-black/55 p-2">
                  {Array.from({ length: 38 }, (_, i) => <span key={i} className="w-full rounded-full bg-cyan-200 animate-pulse" style={{ height: `${18 + ((i * 17) % 72)}%`, animationDelay: `${i * 35}ms` }} />)}
                </div>
                <div className="mt-4 flex gap-2"><button className="rounded-full border border-cyan-300/40 px-4 py-2 text-xs font-black uppercase text-cyan-100">Play</button><button className="rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase text-white/70">Queue</button></div>
              </div>
              <div className="mt-3 grid gap-2">
                {profile.music.map((track) => <div key={track.title} className="rounded-xl border border-white/10 bg-black/30 p-3"><b>{track.title}</b><p className="text-xs text-white/45">{track.type} · {track.meta}</p></div>)}
              </div>
            </section>

            <section id="friends" className="rounded-3xl border border-pink-300/20 bg-pink-300/10 p-5">
              <h2 className="text-2xl font-black uppercase tracking-wider">Top Friends</h2>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {profile.topFriends.map((friend) => <div key={friend} className="rounded-2xl border border-white/10 bg-black/45 p-2 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-pink-400 to-cyan-300 text-sm font-black text-black">{friend[0]}</div><p className="mt-2 text-[10px] font-bold text-white/65">{friend}</p></div>)}
              </div>
            </section>
          </aside>
        </div>

        <section id="about" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profileFeatureBlocks.map((block) => <div key={block.title} className="rounded-2xl border border-white/10 bg-black/35 p-4"><h3 className="font-black uppercase tracking-wider text-white">{block.title}</h3><p className="mt-2 text-sm text-white/50">{block.description}</p></div>)}
        </section>
      </section>
    </main>
  );
}

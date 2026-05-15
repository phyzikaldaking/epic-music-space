import Link from "next/link";

const liveRooms = [
  { title: "Atlanta Heat Check", host: "Phyzikal Da King", genre: "Rap / Trap", listeners: 248, track: "Studio Command", state: "LIVE NOW", accent: "cyan" },
  { title: "Producer Feedback Room", host: "EMS A&R", genre: "Beats", listeners: 119, track: "Beat Pack Reviews", state: "LIVE NOW", accent: "pink" },
  { title: "R&B Late Night", host: "Bariee", genre: "R&B / Soul", listeners: 86, track: "Unreleased demos", state: "STARTING SOON", accent: "purple" },
  { title: "VIP Label Preview", host: "Label Row", genre: "Private", listeners: 42, track: "Invite-only drops", state: "VIP SESSION", accent: "gold" },
];

const sessionTools = [
  "Live chat",
  "Emoji reactions",
  "Raise hand",
  "Fan queue",
  "Tipping hooks",
  "Vote on tracks",
  "Replay archive",
  "Host controls",
];

function accentClasses(accent: string) {
  if (accent === "pink") return "border-pink-300/40 bg-pink-300/10 text-pink-100 shadow-[0_0_34px_rgba(255,45,146,.16)]";
  if (accent === "purple") return "border-purple-300/40 bg-purple-300/10 text-purple-100 shadow-[0_0_34px_rgba(168,85,247,.16)]";
  if (accent === "gold") return "border-yellow-300/40 bg-yellow-300/10 text-yellow-100 shadow-[0_0_34px_rgba(253,224,71,.14)]";
  return "border-cyan-300/40 bg-cyan-300/10 text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,.16)]";
}

export const metadata = {
  title: "Listening Sessions | Epic Music Space",
  description: "Join live listening sessions, host feedback rooms, tip creators, react to unreleased music, and replay EMS rooms.",
};

export default function ListeningSessionsPage() {
  return (
    <main id="main-content" data-page="listening-sessions" className="ems-page-scroll-surface min-h-screen overflow-visible px-4 py-24 text-white sm:px-6 lg:px-8">
      <section className="mx-auto min-w-[1040px] max-w-7xl rounded-[32px] border border-cyan-300/20 bg-black/65 p-6 shadow-[0_0_60px_rgba(0,245,255,.12)]">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200/70">EMS Live Rooms</p>
            <h1 className="mt-3 text-5xl font-black uppercase tracking-tight sm:text-7xl">Listening Sessions</h1>
            <p className="mt-4 max-w-3xl text-lg text-white/65">The social heartbeat of Epic Music Space: artists preview records, producers battle ideas, fans react live, and creators turn rooms into revenue.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/studio/live" className="rounded-full border border-pink-300/40 bg-pink-300/15 px-5 py-3 text-sm font-black uppercase tracking-widest text-pink-100">Start a Room</Link>
              <Link href="/studio/try" className="rounded-full border border-cyan-300/40 bg-cyan-300/15 px-5 py-3 text-sm font-black uppercase tracking-widest text-cyan-100">Open Studio</Link>
              <Link href="/artist/phyzikaldaking" className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-widest text-white/80">View Profile</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            {[['Live rooms','12'],['Listeners','1.8K'],['Replays','340'],['Tips today','$2.4K']].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                <div className="text-3xl font-black text-cyan-100">{value}</div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          {liveRooms.map((room) => (
            <article key={room.title} className={`rounded-3xl border p-4 ${accentClasses(room.accent)}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-current/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest">{room.state}</span>
                <span className="text-xs font-black">{room.listeners} listening</span>
              </div>
              <div className="mt-5 h-20 rounded-2xl border border-white/10 bg-black/40 p-3">
                <div className="flex h-full items-end gap-1">
                  {Array.from({ length: 24 }, (_, i) => <span key={i} className="w-full rounded-full bg-current opacity-80 animate-pulse" style={{ height: `${22 + ((i * 13) % 58)}%`, animationDelay: `${i * 45}ms` }} />)}
                </div>
              </div>
              <h2 className="mt-4 text-xl font-black uppercase tracking-wide text-white">{room.title}</h2>
              <p className="mt-1 text-sm text-white/55">Hosted by {room.host}</p>
              <p className="mt-2 text-xs uppercase tracking-widest text-white/45">{room.genre} · {room.track}</p>
              <button className="mt-4 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-white">Join Session</button>
            </article>
          ))}
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[.035] p-5">
          <h2 className="text-2xl font-black uppercase tracking-wider">Room features</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sessionTools.map((tool) => <div key={tool} className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm font-bold text-white/75">{tool}</div>)}
          </div>
        </section>
      </section>
    </main>
  );
}

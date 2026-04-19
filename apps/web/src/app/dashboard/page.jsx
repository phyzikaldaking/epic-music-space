import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatPrice } from "@ems/utils";
export default async function DashboardPage() {
    var _a;
    const session = await auth();
    if (!session)
        redirect("/auth/signin");
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: session.user.id },
        include: {
            licenses: {
                include: { song: true },
                orderBy: { purchasedAt: "desc" },
                take: 10,
            },
            transactions: {
                orderBy: { createdAt: "desc" },
                take: 10,
            },
            songs: {
                where: { isActive: true },
                orderBy: { createdAt: "desc" },
                take: 10,
            },
        },
    });
    const totalInvested = user.transactions
        .filter((t) => t.status === "SUCCEEDED" && t.type === "LICENSE_PURCHASE")
        .reduce((acc, t) => acc + Number(t.amount), 0);
    const totalSongsSold = user.songs.reduce((acc, s) => acc + s.soldLicenses, 0);
    const STAT_CARDS = [
        {
            label: "Licenses held",
            value: user.licenses.length.toString(),
            icon: "🎟️",
            accent: "brand",
            border: "border-brand-500/30",
            bg: "bg-brand-500/8",
            textColor: "text-brand-400",
        },
        {
            label: "Total invested",
            value: formatPrice(totalInvested),
            icon: "💸",
            accent: "gold",
            border: "border-gold-500/30",
            bg: "bg-gold-500/6",
            textColor: "text-gold-400",
        },
        ...(user.role !== "LISTENER"
            ? [
                {
                    label: "Songs uploaded",
                    value: user.songs.length.toString(),
                    icon: "🎵",
                    accent: "cyan",
                    border: "border-accent-500/30",
                    bg: "bg-accent-500/6",
                    textColor: "text-accent-400",
                },
                {
                    label: "Licenses sold",
                    value: totalSongsSold.toString(),
                    icon: "📈",
                    accent: "gold",
                    border: "border-gold-500/30",
                    bg: "bg-gold-500/6",
                    textColor: "text-gold-400",
                },
            ]
            : [
                {
                    label: "Account type",
                    value: user.role,
                    icon: "👤",
                    accent: "brand",
                    border: "border-white/15",
                    bg: "bg-white/4",
                    textColor: "text-white/70",
                },
            ]),
    ];
    return (<div className="min-h-screen bg-[#0a0a0a]">
      {/* Ambient glow top */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-brand-500/10 blur-[120px]"/>

      <div className="relative mx-auto max-w-7xl px-4 py-12">
        {/* ── Header ──────────────────────────────────── */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            <p className="text-sm text-white/40 mb-1">Welcome back</p>
            <h1 className="text-3xl font-extrabold">
              {(_a = user.name) !== null && _a !== void 0 ? _a : user.email}
              <span className="ml-3 rounded-full bg-brand-500/15 border border-brand-500/30 px-3 py-0.5 text-sm font-semibold text-brand-400">
                {user.role}
              </span>
            </h1>
          </div>
          {user.role !== "LISTENER" && (<a href="/studio/new" className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 glow-purple-sm">
              + Upload Song
            </a>)}
        </div>

        {/* ── Stat cards ──────────────────────────────── */}
        <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_CARDS.map((stat) => (<div key={stat.label} className={`rounded-2xl border ${stat.border} ${stat.bg} p-5 transition card-hover-neon`}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
                  {stat.label}
                </p>
                <span className="text-xl">{stat.icon}</span>
              </div>
              <p className={`stat-number ${stat.textColor}`}>{stat.value}</p>
            </div>))}
        </div>

        {/* ── My Licenses ─────────────────────────────── */}
        <section className="mb-12">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold">My Licenses</h2>
            {user.licenses.length > 0 && (<span className="text-sm text-white/35">
                {user.licenses.length} active
              </span>)}
          </div>
          {user.licenses.length === 0 ? (<div className="rounded-2xl border border-white/8 bg-[#141414] p-10 text-center">
              <p className="mb-2 text-4xl">🎟️</p>
              <p className="font-semibold text-white/50">No licenses yet.</p>
              <a href="/marketplace" className="mt-3 inline-block rounded-xl bg-brand-500/15 border border-brand-500/30 px-5 py-2 text-sm font-semibold text-brand-400 hover:bg-brand-500/25 transition">
                Browse the marketplace →
              </a>
            </div>) : (<div className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
              <table className="w-full text-sm">
                <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Song</th>
                    <th className="px-5 py-3.5 text-left">License #</th>
                    <th className="px-5 py-3.5 text-left">Price paid</th>
                    <th className="px-5 py-3.5 text-left">Status</th>
                    <th className="px-5 py-3.5 text-left">Purchased</th>
                  </tr>
                </thead>
                <tbody>
                  {user.licenses.map((l) => (<tr key={l.id} className="border-b border-white/5 transition hover:bg-white/3">
                      <td className="px-5 py-3.5">
                        <a href={`/studio/${l.song.id}`} className="font-semibold text-brand-400 hover:underline">
                          {l.song.title}
                        </a>
                        <div className="text-xs text-white/35">{l.song.artist}</div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-white/60">
                        #{l.tokenNumber}
                      </td>
                      <td className="px-5 py-3.5 text-gold-400 font-semibold">
                        {formatPrice(l.price)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${l.status === "ACTIVE"
                    ? "bg-green-500/15 text-green-400 border border-green-500/25"
                    : "bg-red-500/15 text-red-400 border border-red-500/25"}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-white/40 text-xs">
                        {new Date(l.purchasedAt).toLocaleDateString()}
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </section>

        {/* ── Artist: My Songs ─────────────────────────── */}
        {user.role !== "LISTENER" && (<section className="mb-12">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">My Songs</h2>
              <a href="/studio/new" className="rounded-lg bg-brand-500/15 border border-brand-500/30 px-4 py-1.5 text-sm font-semibold text-brand-400 hover:bg-brand-500/25 transition">
                + Upload song
              </a>
            </div>
            {user.songs.length === 0 ? (<div className="rounded-2xl border border-white/8 bg-[#141414] p-10 text-center text-white/40">
                <p className="mb-2 text-4xl">🎙️</p>
                <p className="font-semibold">No songs uploaded yet.</p>
              </div>) : (<div className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                    <tr>
                      <th className="px-5 py-3.5 text-left">Title</th>
                      <th className="px-5 py-3.5 text-left">Price</th>
                      <th className="px-5 py-3.5 text-left">Rev share</th>
                      <th className="px-5 py-3.5 text-left">Sold</th>
                      <th className="px-5 py-3.5 text-left">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.songs.map((s) => (<tr key={s.id} className="border-b border-white/5 transition hover:bg-white/3">
                        <td className="px-5 py-3.5">
                          <a href={`/studio/${s.id}`} className="font-semibold text-brand-400 hover:underline">
                            {s.title}
                          </a>
                        </td>
                        <td className="px-5 py-3.5 text-gold-400 font-semibold">
                          {formatPrice(s.licensePrice)}
                        </td>
                        <td className="px-5 py-3.5 text-accent-400">
                          {String(s.revenueSharePct)}%
                        </td>
                        <td className="px-5 py-3.5 text-white/60">{s.soldLicenses}</td>
                        <td className="px-5 py-3.5">
                          <span className={`font-semibold ${s.totalLicenses - s.soldLicenses === 0
                        ? "text-red-400"
                        : "text-green-400"}`}>
                            {s.totalLicenses - s.soldLicenses}
                          </span>
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>)}
          </section>)}

        {/* ── Transaction history ──────────────────────── */}
        <section>
          <h2 className="mb-5 text-xl font-bold">Transaction History</h2>
          {user.transactions.length === 0 ? (<div className="rounded-2xl border border-white/8 bg-[#141414] p-8 text-center text-white/35 text-sm">
              No transactions yet.
            </div>) : (<div className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
              <table className="w-full text-sm">
                <thead className="border-b border-white/8 bg-white/3 text-xs uppercase tracking-widest text-white/35">
                  <tr>
                    <th className="px-5 py-3.5 text-left">Type</th>
                    <th className="px-5 py-3.5 text-left">Amount</th>
                    <th className="px-5 py-3.5 text-left">Status</th>
                    <th className="px-5 py-3.5 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {user.transactions.map((t) => (<tr key={t.id} className="border-b border-white/5 transition hover:bg-white/3">
                      <td className="px-5 py-3.5 text-white/60">
                        {t.type.replace(/_/g, " ")}
                      </td>
                      <td className="px-5 py-3.5 text-gold-400 font-semibold">
                        {formatPrice(t.amount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${t.status === "SUCCEEDED"
                    ? "bg-green-500/15 text-green-400 border border-green-500/25"
                    : t.status === "PENDING"
                        ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25"
                        : "bg-red-500/15 text-red-400 border border-red-500/25"}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-white/40 text-xs">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </section>
      </div>
    </div>);
}

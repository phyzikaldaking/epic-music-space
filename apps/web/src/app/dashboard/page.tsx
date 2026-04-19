import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatPrice } from "@ems/utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold">
          Welcome back, {user.name ?? user.email}
        </h1>
        <p className="mt-1 text-white/50">Your music licensing dashboard</p>
      </div>

      {/* Stats row */}
      <div className="mb-10 grid gap-4 md:grid-cols-4">
        {[
          { label: "Licenses held", value: user.licenses.length },
          { label: "Total invested", value: formatPrice(totalInvested) },
          {
            label: "Songs uploaded",
            value: user.songs.length,
            hidden: user.role === "LISTENER",
          },
          { label: "Account type", value: user.role },
        ]
          .filter((s) => !s.hidden)
          .map((stat) => (
            <div key={stat.label} className="glass rounded-2xl p-5">
              <p className="text-sm text-white/50">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-brand-400">
                {stat.value}
              </p>
            </div>
          ))}
      </div>

      {/* My Licenses */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">My Licenses</h2>
        {user.licenses.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-white/40">
            <p>No licenses yet.</p>
            <a
              href="/marketplace"
              className="mt-3 inline-block text-brand-400 hover:underline"
            >
              Browse the marketplace →
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 bg-white/5 text-white/50">
                <tr>
                  <th className="px-4 py-3 text-left">Song</th>
                  <th className="px-4 py-3 text-left">License #</th>
                  <th className="px-4 py-3 text-left">Price paid</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Purchased</th>
                </tr>
              </thead>
              <tbody>
                {user.licenses.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`/studio/${l.song.id}`}
                        className="font-medium text-brand-400 hover:underline"
                      >
                        {l.song.title}
                      </a>
                      <div className="text-xs text-white/40">{l.song.artist}</div>
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      #{l.tokenNumber}
                    </td>
                    <td className="px-4 py-3">{formatPrice(l.price)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          l.status === "ACTIVE"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/50">
                      {new Date(l.purchasedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Artist: My Songs */}
      {user.role !== "LISTENER" && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">My Songs</h2>
            <a
              href="/studio/new"
              className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold hover:bg-brand-600 transition"
            >
              + Upload song
            </a>
          </div>
          {user.songs.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-white/40">
              <p>No songs uploaded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10 bg-white/5 text-white/50">
                  <tr>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Price</th>
                    <th className="px-4 py-3 text-left">Rev share</th>
                    <th className="px-4 py-3 text-left">Sold</th>
                    <th className="px-4 py-3 text-left">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {user.songs.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-white/5 hover:bg-white/5"
                    >
                      <td className="px-4 py-3">
                        <a
                          href={`/studio/${s.id}`}
                          className="font-medium text-brand-400 hover:underline"
                        >
                          {s.title}
                        </a>
                      </td>
                      <td className="px-4 py-3">{formatPrice(s.licensePrice)}</td>
                      <td className="px-4 py-3">{String(s.revenueSharePct)}%</td>
                      <td className="px-4 py-3">{s.soldLicenses}</td>
                      <td className="px-4 py-3">
                        {s.totalLicenses - s.soldLicenses}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

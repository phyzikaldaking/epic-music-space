import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LabelDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();

  const label = await prisma.label.findUnique({
    where: { id },
    include: {
      owner: {
        select: { id: true, name: true, image: true, studio: { select: { username: true } } },
      },
      artists: {
        include: {
          artist: {
            select: {
              id: true,
              name: true,
              image: true,
              studio: { select: { username: true } },
              songs: { where: { isActive: true }, select: { soldLicenses: true } },
            },
          },
        },
      },
    },
  });

  if (!label) notFound();

  const isOwner = session?.user?.id === label.ownerId;
  const myMembership = label.artists.find(
    (la) => la.artistId === session?.user?.id
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Header */}
      <div className="mb-8 flex items-center gap-5">
        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-accent-600 flex items-center justify-center text-3xl">
          {label.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={label.logoUrl} alt={label.name} className="h-full w-full object-cover" />
          ) : (
            "🏷️"
          )}
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">{label.name}</h1>
          <p className="text-sm text-white/50">
            Owned by{" "}
            <a
              href={
                label.owner.studio?.username
                  ? `/studio/${label.owner.studio.username}`
                  : "#"
              }
              className="text-brand-400 hover:underline"
            >
              {label.owner.name ?? "Unknown"}
            </a>
          </p>
        </div>
      </div>

      {label.bio && (
        <p className="mb-8 text-sm text-white/60">{label.bio}</p>
      )}

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        {[
          { label: "Artists signed", value: label.artists.filter((a) => a.status === "ACTIVE").length },
          { label: "Label rev share", value: `${String(label.revSharePct)}%` },
          {
            label: "Total licenses sold",
            value: label.artists.reduce(
              (s, la) => s + la.artist.songs.reduce((ss, x) => ss + x.soldLicenses, 0),
              0
            ),
          },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4 text-center">
            <p className="text-xs text-white/50">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-brand-400">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Artist roster */}
      <section className="mb-8">
        <h2 className="mb-4 text-xl font-semibold">Artist Roster</h2>
        {label.artists.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-white/30 text-sm">
            No artists signed yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 bg-white/5 text-white/50">
                <tr>
                  <th className="px-4 py-3 text-left">Artist</th>
                  <th className="px-4 py-3 text-left">Rev share</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Licenses sold</th>
                </tr>
              </thead>
              <tbody>
                {label.artists.map((la) => (
                  <tr key={la.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3">
                      <a
                        href={
                          la.artist.studio?.username
                            ? `/studio/${la.artist.studio.username}`
                            : "#"
                        }
                        className="font-medium text-brand-400 hover:underline"
                      >
                        {la.artist.name ?? "Unknown"}
                      </a>
                    </td>
                    <td className="px-4 py-3">{String(la.revSharePct)}%</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          la.status === "ACTIVE"
                            ? "bg-green-500/20 text-green-400"
                            : la.status === "PENDING"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {la.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {la.artist.songs.reduce((s, x) => s + x.soldLicenses, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Artist: accept/decline offer */}
      {myMembership?.status === "PENDING" && (
        <section className="mb-8 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5">
          <h3 className="mb-2 font-semibold text-yellow-400">📩 Label Offer Pending</h3>
          <p className="mb-4 text-sm text-white/60">
            {label.name} has offered you a{" "}
            <strong className="text-white">{String(myMembership.revSharePct)}%</strong> revenue-share deal.
            They will receive that percentage of your licensing earnings going forward.
          </p>
          <div className="flex gap-3">
            <form action={`/api/labels/${id}/artists`} method="PATCH">
              <input type="hidden" name="action" value="accept" />
              <button
                type="submit"
                className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold hover:bg-green-700 transition"
              >
                Accept
              </button>
            </form>
            <form action={`/api/labels/${id}/artists`} method="PATCH">
              <input type="hidden" name="action" value="decline" />
              <button
                type="submit"
                className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold hover:bg-white/10 transition"
              >
                Decline
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Owner actions */}
      {isOwner && (
        <section className="glass rounded-2xl p-5">
          <h3 className="mb-3 font-semibold">Label Owner Actions</h3>
          <p className="text-sm text-white/50">
            Use the API (<code className="text-brand-400">POST /api/labels/{id}/artists</code>) to
            send signing offers to artists by their user ID.
          </p>
        </section>
      )}
    </div>
  );
}

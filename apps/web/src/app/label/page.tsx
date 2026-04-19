import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LabelListPage() {
  const labels = await prisma.label.findMany({
    include: {
      owner: { select: { name: true, image: true, studio: { select: { username: true } } } },
      _count: { select: { artists: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold">🏷️ Labels</h1>
          <p className="mt-2 text-white/50">
            Labels sign artists and earn a revenue share from their licensing activity.
          </p>
        </div>
        <a
          href="/label/new"
          className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold hover:bg-brand-600 transition"
        >
          + Create Label
        </a>
      </div>

      {labels.length === 0 ? (
        <div className="py-24 text-center text-white/30">
          <p className="text-xl font-semibold">No labels yet.</p>
          <p className="mt-2 text-sm">Be the first to start one.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {labels.map((label) => (
            <a
              key={label.id}
              href={`/label/${label.id}`}
              className="glass rounded-2xl p-5 transition hover:border-brand-500/50"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900 to-accent-600 flex items-center justify-center text-2xl">
                  {label.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={label.logoUrl} alt={label.name} className="h-full w-full object-cover" />
                  ) : (
                    "🏷️"
                  )}
                </div>
                <div>
                  <h3 className="font-bold">{label.name}</h3>
                  <p className="text-xs text-white/50">
                    by {label.owner.name ?? "Unknown"}
                  </p>
                </div>
              </div>
              {label.bio && (
                <p className="mb-3 text-xs text-white/50 line-clamp-2">{label.bio}</p>
              )}
              <div className="flex justify-between text-xs text-white/40">
                <span>{label._count.artists} artists</span>
                <span>{String(label.revSharePct)}% rev share</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

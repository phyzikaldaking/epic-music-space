import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Labels",
  description:
    "Browse artist labels on Epic Music Space and create a roster for licensing releases.",
};

type LabelListItem = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  bio: string | null;
  revSharePct: { toString(): string };
  owner: {
    name: string | null;
    studio: { username: string } | null;
  };
  _count: { artists: number };
};

export default async function LabelListPage() {
  let labels: LabelListItem[] = [];
  let catalogUnavailable = !hasUsableDatabaseUrl();

  if (!catalogUnavailable) {
    try {
      labels = await prisma.label.findMany({
        include: {
          owner: {
            select: {
              name: true,
              studio: { select: { username: true } },
            },
          },
          _count: { select: { artists: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      catalogUnavailable = true;
    }
  }

  return (
    <div className="min-h-screen bg-[#050509]">
      <section className="border-b border-white/8 px-4 py-14 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <p className="mb-4 border-l-2 border-gold-300 pl-3 text-xs font-black uppercase tracking-[0.24em] text-gold-300">
                Label row
              </p>
              <h1 className="max-w-4xl text-5xl font-black tracking-tight md:text-7xl">
                Build the roster behind the next licensing catalog.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/58">
                Labels organize artists, negotiate revenue-share terms, and
                create a recognizable home for releases inside EMS.
              </p>
            </div>
            <div className="border-y border-white/10 py-6 lg:border-y-0 lg:border-l lg:py-0 lg:pl-8">
              <dl className="grid grid-cols-2 gap-6">
                <div>
                  <dd className="text-3xl font-black text-white">
                    {labels.length}
                  </dd>
                  <dt className="mt-1 text-xs uppercase tracking-[0.18em] text-white/36">
                    Active labels
                  </dt>
                </div>
                <div>
                  <dd className="text-3xl font-black text-accent-300">
                    {labels.reduce((sum, label) => sum + label._count.artists, 0)}
                  </dd>
                  <dt className="mt-1 text-xs uppercase tracking-[0.18em] text-white/36">
                    Signed artists
                  </dt>
                </div>
              </dl>
              <Link
                href="/label/new"
                className="mt-7 inline-flex h-11 items-center justify-center rounded-md bg-white px-5 text-sm font-black text-[#050509] transition hover:bg-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Create label
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 md:py-14">
        {catalogUnavailable ? (
          <div className="border-y border-white/10 py-16">
            <p className="text-2xl font-black">Label data is waiting on the database.</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
              The route is online, but no production `DATABASE_URL` is available
              in this environment yet. You can still create the first label once
              production database credentials are connected.
            </p>
            <Link
              href="/label/new"
              className="mt-7 inline-flex h-11 items-center rounded-md border border-white/16 px-5 text-sm font-bold text-white/70 transition hover:border-white/32 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Prepare label profile
            </Link>
          </div>
        ) : labels.length === 0 ? (
          <div className="border-y border-white/10 py-16">
            <p className="text-2xl font-black">No labels yet.</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
              Start a label to group artists under one roster, set terms, and
              build a stronger discovery identity.
            </p>
            <Link
              href="/label/new"
              className="mt-7 inline-flex h-11 items-center rounded-md bg-white px-5 text-sm font-black text-[#050509] transition hover:bg-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Create the first label
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/10 border-y border-white/10">
            {labels.map((label, index) => (
              <Link
                key={label.id}
                href={`/label/${label.id}`}
                className="group grid gap-5 py-7 transition hover:bg-white/[0.025] md:grid-cols-[96px_1fr_0.55fr] md:items-center"
              >
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-xl font-black text-white/50">
                  {label.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={label.logoUrl}
                      alt={`${label.name} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/34">
                    {label.owner.studio?.username
                      ? `@${label.owner.studio.username}`
                      : label.owner.name ?? "Independent label"}
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight transition group-hover:text-accent-300">
                    {label.name}
                  </h2>
                  {label.bio && (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
                      {label.bio}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm md:text-right">
                  <div>
                    <p className="font-black text-white">{label._count.artists}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/34">
                      Artists
                    </p>
                  </div>
                  <div>
                    <p className="font-black text-gold-300">
                      {label.revSharePct.toString()}%
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/34">
                      Label cut
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

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

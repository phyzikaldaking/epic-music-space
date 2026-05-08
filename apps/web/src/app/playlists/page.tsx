import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CreatePlaylistButton from "./CreatePlaylistButton";

export const metadata: Metadata = {
  title: "Playlists",
  description: "Your playlists on Epic Music Space.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/playlists");

  const playlists = await prisma.playlist.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const ids = playlists.map((p) => p.id);
  const counts = ids.length
    ? await prisma.playlistTrack.groupBy({
        by: ["playlistId"],
        where: { playlistId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const countByPlaylist = new Map(
    counts.map((c) => [c.playlistId, c._count._all]),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">
            Your library
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-gradient-ems">Playlists</h1>
          <p className="mt-1 text-sm text-white/55">
            Build and share track collections. Drop the link to anyone — they don&apos;t need an account to listen.
          </p>
        </div>
        <CreatePlaylistButton />
      </div>

      {playlists.length === 0 ? (
        <div className="rounded-2xl border border-white/10 studio-faceplate p-10 text-center">
          <p className="mb-3 text-4xl" aria-hidden>🎵</p>
          <p className="text-sm font-semibold text-white/85">
            You haven&apos;t made a playlist yet.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-white/45">
            Create one and start adding tracks from the marketplace, your saves, or any artist&apos;s page.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {playlists.map((p) => {
            const count = countByPlaylist.get(p.id) ?? 0;
            return (
              <Link
                key={p.id}
                href={`/playlists/${p.id}`}
                className="group flex flex-col rounded-2xl border border-white/10 studio-faceplate p-4 transition hover:border-brand-500/60"
              >
                <div className="aspect-square w-full overflow-hidden rounded-xl bg-gradient-to-br from-brand-600/30 to-fuchsia-600/30">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.coverUrl}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl opacity-70" aria-hidden>
                      🎵
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <h2 className="line-clamp-2 text-sm font-bold text-white/95">
                    {p.name}
                  </h2>
                  {p.isPublic && (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                      Public
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-white/45">
                  {count} {count === 1 ? "track" : "tracks"} · Updated{" "}
                  {new Date(p.updatedAt).toLocaleDateString()}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

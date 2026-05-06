import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Image from "next/image";
import VersusInboxClient from "./VersusInboxClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Versus inbox — Epic Music Space",
  robots: { index: false, follow: false },
};

export default async function VersusInboxPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/versus/inbox");

  const SINCE_VERZUZ = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [incoming, outgoing, mySongs, verzuzIncoming, verzuzOutgoing] = await Promise.all([
    prisma.versusChallenge.findMany({
      where: { opponentId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.versusChallenge.findMany({
      where: { challengerId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.song.findMany({
      where: { artistId: session.user.id, isActive: true },
      select: { id: true, title: true, coverUrl: true },
      orderBy: { aiScore: "desc" },
      take: 25,
    }),
    prisma.verzuzChallenge.findMany({
      where: {
        opponentId: session.user.id,
        OR: [{ status: "PENDING" }, { createdAt: { gte: SINCE_VERZUZ } }],
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.verzuzChallenge.findMany({
      where: {
        challengerId: session.user.id,
        OR: [{ status: "PENDING" }, { createdAt: { gte: SINCE_VERZUZ } }],
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  // Resolve Verzuz participant display info in one round-trip.
  const verzuzUserIds = Array.from(
    new Set(
      [...verzuzIncoming, ...verzuzOutgoing].flatMap((c) => [
        c.challengerId,
        c.opponentId,
      ]),
    ),
  );
  const verzuzUsers = verzuzUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: verzuzUserIds } },
        select: {
          id: true,
          name: true,
          image: true,
          studio: { select: { username: true } },
        },
      })
    : [];
  const verzuzUserById = new Map(verzuzUsers.map((u) => [u.id, u]));

  // Stitch in the songs / opponent display info (single round-trip).
  const songIds = Array.from(
    new Set(
      [...incoming, ...outgoing].flatMap((c) =>
        [c.challengerSongId, c.opponentSongId].filter((x): x is string => !!x),
      ),
    ),
  );
  const userIds = Array.from(
    new Set([...incoming, ...outgoing].flatMap((c) => [c.challengerId, c.opponentId])),
  );
  const [songs, users] = await Promise.all([
    prisma.song.findMany({
      where: { id: { in: songIds } },
      select: { id: true, title: true, artist: true, coverUrl: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true, studio: { select: { username: true } } },
    }),
  ]);
  const songById = new Map(songs.map((s) => [s.id, s]));
  const userById = new Map(users.map((u) => [u.id, u]));

  function decorate(c: (typeof incoming)[number]) {
    return {
      ...c,
      challenger: userById.get(c.challengerId) ?? null,
      opponent: userById.get(c.opponentId) ?? null,
      challengerSong: songById.get(c.challengerSongId) ?? null,
      opponentSong: c.opponentSongId ? songById.get(c.opponentSongId) ?? null : null,
    };
  }

  const verzuzAll = [
    ...verzuzIncoming.map((c) => ({ ...c, _direction: "INCOMING" as const })),
    ...verzuzOutgoing.map((c) => ({ ...c, _direction: "OUTGOING" as const })),
  ].sort(
    (a, b) =>
      // Pending first, then most recent
      (a.status === "PENDING" ? 0 : 1) - (b.status === "PENDING" ? 0 : 1) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Versus inbox</h1>
        <Link
          href="/versus/new"
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold hover:bg-brand-600"
        >
          + Send a challenge
        </Link>
      </div>

      {verzuzAll.length > 0 && (
        <section className="mb-8 rounded-3xl border border-rose-400/30 bg-rose-500/8 p-5 backdrop-blur-md">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-300">
                🎤 Verzuz · cross-artist invites
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">
                {verzuzAll.filter((c) => c.status === "PENDING").length > 0
                  ? `${verzuzAll.filter((c) => c.status === "PENDING").length} pending`
                  : "Recent activity"}
              </h2>
            </div>
            <Link
              href="/verzuz/challenge/new"
              className="rounded-xl border border-rose-400/35 bg-rose-500/12 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/20"
            >
              + Send Verzuz invite
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {verzuzAll.slice(0, 8).map((c) => {
              const peerId = c._direction === "INCOMING" ? c.challengerId : c.opponentId;
              const peer = verzuzUserById.get(peerId);
              const expired =
                c.status === "PENDING" && c.expiresAt < new Date();
              const status = expired ? "EXPIRED" : c.status;
              return (
                <li key={c.id}>
                  <Link
                    href={`/verzuz/challenge/${c.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/3 p-3 transition hover:border-rose-400/40 hover:bg-white/6"
                  >
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                      {peer?.image ? (
                        <Image
                          src={peer.image}
                          alt=""
                          fill
                          sizes="40px"
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm">
                          🎤
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">
                        {c._direction === "INCOMING" ? "From " : "To "}
                        <span className="text-rose-200">
                          {peer?.name ?? "an artist"}
                        </span>
                        {c.proposedTheme ? (
                          <span className="ml-2 text-xs font-normal text-white/55">
                            · {c.proposedTheme}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/50">
                        {c.proposedTotalRounds} rounds · starts{" "}
                        {new Date(c.proposedStartsAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                        status === "PENDING"
                          ? "border border-rose-400/55 bg-rose-500/15 text-rose-200"
                          : status === "ACCEPTED"
                            ? "border border-emerald-400/45 bg-emerald-400/10 text-emerald-200"
                            : status === "DECLINED" || status === "CANCELLED"
                              ? "border border-white/15 bg-white/5 text-white/55"
                              : "border border-amber-400/40 bg-amber-400/10 text-amber-200"
                      }`}
                    >
                      {status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <VersusInboxClient
        incoming={incoming.map(decorate)}
        outgoing={outgoing.map(decorate)}
        mySongs={mySongs}
      />
    </div>
  );
}

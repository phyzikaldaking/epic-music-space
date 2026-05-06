import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function RoyaleOgImage({ params }: { params: { id: string } }) {
  const battle = await prisma.battleRoyale
    .findUnique({
      where: { id: params.id },
      include: {
        entries: {
          include: {
            song: { select: { title: true, artist: true, coverUrl: true } },
          },
          orderBy: { votes: "desc" },
        },
      },
    })
    .catch(() => null);

  if (!battle) {
    return new ImageResponse(
      (
        <div tw="flex h-full w-full items-center justify-center bg-[#0a0a14] text-[64px] font-black text-white">
          ⚔️ Battle not found
        </div>
      ),
      size,
    );
  }

  const totalVotes = battle.entries.reduce((sum, e) => sum + e.votes, 0);
  const isCompleted =
    battle.status === "COMPLETED" || battle.endsAt < new Date();
  const winner = isCompleted && totalVotes > 0 ? battle.entries[0] : null;
  // Top 4 in the OG image — past that the cards crowd. Total count is in
  // the badge so viewers know there are more.
  const display = battle.entries.slice(0, 4);

  return new ImageResponse(
    (
      <div tw="flex h-full w-full flex-col bg-[linear-gradient(135deg,#0a0a14_0%,#1a0f2e_50%,#14091e_100%)] p-10 text-white">
        <div tw="mb-4 flex items-center gap-3">
          <div tw="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#fbbf2480] bg-[#fbbf2440] text-[18px] text-amber-300">
            🏆
          </div>
          <span tw="text-[22px] font-extrabold text-amber-300">
            Epic Music Space — Battle Royale
          </span>
          <span tw="ml-auto text-[14px] text-white/50">
            {isCompleted ? "FINAL" : "LIVE"}
          </span>
        </div>

        <div tw="mb-2 flex items-center gap-3 text-[18px] text-white/60">
          <span>{battle.entries.length}-track battle</span>
          <span>·</span>
          <span>
            {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
          </span>
        </div>

        <div tw="flex flex-1 flex-wrap items-stretch gap-4">
          {display.map((entry, i) => {
            const pct =
              totalVotes > 0
                ? Math.round((entry.votes / totalVotes) * 100)
                : 0;
            const isWinner =
              isCompleted && winner?.id === entry.id && totalVotes > 0;
            const accent = isWinner ? "#ffd76b" : i === 0 ? "#c4a8ff" : "#7adfff";
            return (
              <div
                key={entry.id}
                tw={`flex w-[260px] flex-col items-center gap-[10px] rounded-[18px] p-4 ${
                  isWinner
                    ? "border-[3px] border-[#ffd76b] bg-[#ffd70014]"
                    : "border border-white/12 bg-white/3"
                }`}
              >
                {entry.song.coverUrl ? (
                  <img
                    src={entry.song.coverUrl}
                    alt=""
                    width={140}
                    height={140}
                    tw="rounded-[14px] object-cover"
                  />
                ) : (
                  <div tw="flex h-[140px] w-[140px] items-center justify-center rounded-[14px] bg-[#222222] text-[48px]">
                    🎵
                  </div>
                )}
                <div tw="text-center text-[18px] font-black leading-[1.05]">
                  {entry.song.title}
                </div>
                <div tw="text-[12px] text-white/55">{entry.song.artist}</div>
                <div tw="mt-auto text-[28px] font-black" style={{ color: accent }}>
                  {pct}%
                </div>
              </div>
            );
          })}
        </div>

        <div tw="mt-3 text-center text-[16px] text-white/45">
          Vote at epicmusicspace.com/versus/royale/{params.id.slice(0, 8)}…
        </div>
      </div>
    ),
    size,
  );
}

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function VersusOgImage({ params }: { params: { id: string } }) {
  const match = await prisma.versusMatch
    .findUnique({
      where: { id: params.id },
      include: {
        songA: { select: { title: true, artist: true, coverUrl: true } },
        songB: { select: { title: true, artist: true, coverUrl: true } },
      },
    })
    .catch(() => null);

  if (!match) {
    return new ImageResponse(
      (
        <div tw="flex h-full w-full items-center justify-center bg-[#0a0a14] text-[64px] font-black text-white">
          ⚔️ Battle not found
        </div>
      ),
      size,
    );
  }

  const total = match.votesA + match.votesB;
  const pctA = total > 0 ? Math.round((match.votesA / total) * 100) : 50;
  const pctB = 100 - pctA;
  const isCompleted = match.status === "COMPLETED" || match.endsAt < new Date();
  const winner = isCompleted ? (match.votesA >= match.votesB ? "A" : "B") : null;

  return new ImageResponse(
    (
      <div tw="flex h-full w-full flex-col bg-[linear-gradient(135deg,#0a0a14_0%,#1a0f2e_50%,#14091e_100%)] p-10 text-white">
        <div tw="mb-4 flex items-center gap-3">
          <div tw="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#6c5ce780] bg-[#6c5ce740] text-[18px] text-cyan-300">
            ⚔
          </div>
          <span tw="text-[22px] font-extrabold text-violet-300">
            Epic Music Space — Versus
          </span>
          <span tw="ml-auto text-[14px] text-white/50">
            {isCompleted ? "FINAL" : "LIVE"}
          </span>
        </div>

        <div tw="flex flex-1 items-center gap-8">
          {/* Side A */}
          <div tw={`flex flex-1 flex-col items-center gap-[14px] rounded-[24px] p-6 ${winner === "A" ? "border-[3px] border-[#ffd76b] bg-[#ffd70014]" : "border border-white/12 bg-white/3"}`}>
            {match.songA.coverUrl ? (
              <img
                src={match.songA.coverUrl}
                alt=""
                width={220}
                height={220}
                tw="rounded-[18px] object-cover"
              />
            ) : (
              <div tw="flex h-[220px] w-[220px] items-center justify-center rounded-[18px] bg-[#222222] text-[64px]">🎵</div>
            )}
            <div tw="text-center text-[28px] font-black leading-[1.1]">
              {match.songA.title}
            </div>
            <div tw="text-[18px] text-white/60">{match.songA.artist}</div>
            <div tw={`text-[36px] font-black ${winner === "A" ? "text-[#ffd76b]" : "text-violet-300"}`}>
              {pctA}%
            </div>
          </div>

          <div tw="text-[64px] font-black text-white/25">VS</div>

          {/* Side B */}
          <div tw={`flex flex-1 flex-col items-center gap-[14px] rounded-[24px] p-6 ${winner === "B" ? "border-[3px] border-[#ffd76b] bg-[#ffd70014]" : "border border-white/12 bg-white/3"}`}>
            {match.songB.coverUrl ? (
              <img
                src={match.songB.coverUrl}
                alt=""
                width={220}
                height={220}
                tw="rounded-[18px] object-cover"
              />
            ) : (
              <div tw="flex h-[220px] w-[220px] items-center justify-center rounded-[18px] bg-[#222222] text-[64px]">🎵</div>
            )}
            <div tw="text-center text-[28px] font-black leading-[1.1]">
              {match.songB.title}
            </div>
            <div tw="text-[18px] text-white/60">{match.songB.artist}</div>
            <div tw={`text-[36px] font-black ${winner === "B" ? "text-[#ffd76b]" : "text-cyan-300"}`}>
              {pctB}%
            </div>
          </div>
        </div>

        <div tw="mt-3 text-center text-[16px] text-white/45">
          Vote at epicmusicspace.com/versus/{params.id.slice(0, 8)}…
        </div>
      </div>
    ),
    size,
  );
}

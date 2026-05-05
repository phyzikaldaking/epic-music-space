import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function VerzuzOgImage({ params }: { params: { id: string } }) {
  const match = await prisma.verzuzMatch
    .findUnique({
      where: { id: params.id },
      include: {
        artistA: { select: { name: true, image: true } },
        artistB: { select: { name: true, image: true } },
        rounds: {
          select: { winner: true, votesA: true, votesB: true },
        },
      },
    })
    .catch(() => null);

  if (!match) {
    return new ImageResponse(
      (
        <div tw="flex h-full w-full items-center justify-center bg-[#0a0a14] text-[64px] font-black text-white">
          🎤 Verzuz not found
        </div>
      ),
      size,
    );
  }

  const roundsWonA = match.rounds.filter((r) => r.winner === "A").length;
  const roundsWonB = match.rounds.filter((r) => r.winner === "B").length;
  const isCompleted = match.status === "COMPLETED";
  const winner = isCompleted
    ? roundsWonA > roundsWonB
      ? "A"
      : roundsWonB > roundsWonA
        ? "B"
        : "TIE"
    : null;

  const artistAName = match.artistAName ?? match.artistA.name ?? "Artist A";
  const artistBName = match.artistBName ?? match.artistB.name ?? "Artist B";

  const statusLabel =
    match.status === "LIVE"
      ? "LIVE"
      : match.status === "COMPLETED"
        ? "FINAL"
        : "SCHEDULED";

  return new ImageResponse(
    (
      <div tw="flex h-full w-full flex-col bg-[linear-gradient(135deg,#0a0a14_0%,#1a0f2e_50%,#14091e_100%)] p-10 text-white">
        <div tw="mb-4 flex items-center gap-3">
          <div tw="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#6c5ce780] bg-[#6c5ce740] text-[18px] text-cyan-300">
            🎤
          </div>
          <span tw="text-[22px] font-extrabold text-violet-300">
            Epic Music Space — Verzuz
          </span>
          <span tw="ml-auto text-[14px] text-white/50">{statusLabel}</span>
        </div>

        {match.theme && (
          <div tw="mb-3 text-[20px] font-bold text-white/70">{match.theme}</div>
        )}

        <div tw="flex flex-1 items-center gap-8">
          <ArtistSide
            name={artistAName}
            image={match.artistA.image}
            roundsWon={roundsWonA}
            totalRounds={match.totalRounds}
            isWinner={winner === "A"}
            color="violet"
          />

          <div tw="flex flex-col items-center text-[64px] font-black text-white/25">
            VS
            <span tw="mt-1 text-[16px] font-bold text-white/40">
              Round {Math.min(match.currentRound, match.totalRounds)} / {match.totalRounds}
            </span>
          </div>

          <ArtistSide
            name={artistBName}
            image={match.artistB.image}
            roundsWon={roundsWonB}
            totalRounds={match.totalRounds}
            isWinner={winner === "B"}
            color="cyan"
          />
        </div>

        <div tw="mt-3 text-center text-[16px] text-white/45">
          {match.status === "SCHEDULED"
            ? `Tap in: epicmusicspace.com/verzuz/${params.id.slice(0, 8)}…`
            : `Watch & vote: epicmusicspace.com/verzuz/${params.id.slice(0, 8)}…`}
        </div>
      </div>
    ),
    size,
  );
}

function ArtistSide({
  name,
  image,
  roundsWon,
  totalRounds,
  isWinner,
  color,
}: {
  name: string;
  image: string | null;
  roundsWon: number;
  totalRounds: number;
  isWinner: boolean;
  color: "violet" | "cyan";
}) {
  const accent = color === "violet" ? "#c4a8ff" : "#7adfff";
  return (
    <div
      tw={`flex flex-1 flex-col items-center gap-[14px] rounded-[24px] p-6 ${
        isWinner ? "border-[3px] border-[#ffd76b] bg-[#ffd70014]" : "border border-white/12 bg-white/3"
      }`}
    >
      {image ? (
        <img
          src={image}
          alt=""
          width={220}
          height={220}
          tw="rounded-full object-cover"
          style={{ borderRadius: "50%" }}
        />
      ) : (
        <div tw="flex h-[220px] w-[220px] items-center justify-center rounded-full bg-[#222222] text-[80px]">
          🎤
        </div>
      )}
      <div tw="text-center text-[32px] font-black leading-[1.05]">{name}</div>
      <div
        tw={`text-[44px] font-black ${isWinner ? "text-[#ffd76b]" : ""}`}
        style={!isWinner ? { color: accent } : undefined}
      >
        {roundsWon} / {totalRounds}
      </div>
      <div tw="text-[14px] uppercase tracking-[0.2em] text-white/40">rounds won</div>
    </div>
  );
}

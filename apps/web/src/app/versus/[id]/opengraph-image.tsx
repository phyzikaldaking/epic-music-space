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
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#0a0a14",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            fontSize: 64,
            fontWeight: 900,
          }}
        >
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
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg,#0a0a14 0%,#1a0f2e 50%,#14091e 100%)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(108,92,231,0.25)",
              border: "1px solid rgba(108,92,231,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              color: "#00F5FF",
            }}
          >
            ⚔
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#a78bfa" }}>
            Epic Music Space — Versus
          </span>
          <span style={{ marginLeft: "auto", fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
            {isCompleted ? "FINAL" : "LIVE"}
          </span>
        </div>

        <div style={{ display: "flex", flex: 1, gap: 32, alignItems: "center" }}>
          {/* Side A */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              padding: 24,
              border: winner === "A" ? "3px solid #ffd76b" : "1px solid rgba(255,255,255,0.12)",
              borderRadius: 24,
              background: winner === "A" ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.03)",
            }}
          >
            {match.songA.coverUrl ? (
              <img
                src={match.songA.coverUrl}
                alt=""
                width={220}
                height={220}
                style={{ borderRadius: 18, objectFit: "cover" }}
              />
            ) : (
              <div style={{ width: 220, height: 220, background: "#222", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>🎵</div>
            )}
            <div style={{ fontSize: 28, fontWeight: 900, textAlign: "center", lineHeight: 1.1 }}>
              {match.songA.title}
            </div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>{match.songA.artist}</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: winner === "A" ? "#ffd76b" : "#a78bfa" }}>
              {pctA}%
            </div>
          </div>

          <div style={{ fontSize: 64, fontWeight: 900, color: "rgba(255,255,255,0.25)" }}>VS</div>

          {/* Side B */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              padding: 24,
              border: winner === "B" ? "3px solid #ffd76b" : "1px solid rgba(255,255,255,0.12)",
              borderRadius: 24,
              background: winner === "B" ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.03)",
            }}
          >
            {match.songB.coverUrl ? (
              <img
                src={match.songB.coverUrl}
                alt=""
                width={220}
                height={220}
                style={{ borderRadius: 18, objectFit: "cover" }}
              />
            ) : (
              <div style={{ width: 220, height: 220, background: "#222", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>🎵</div>
            )}
            <div style={{ fontSize: 28, fontWeight: 900, textAlign: "center", lineHeight: 1.1 }}>
              {match.songB.title}
            </div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>{match.songB.artist}</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: winner === "B" ? "#ffd76b" : "#00F5FF" }}>
              {pctB}%
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 16, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
          Vote at epicmusicspace.com/versus/{params.id.slice(0, 8)}…
        </div>
      </div>
    ),
    size,
  );
}

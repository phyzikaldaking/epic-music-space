import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getDemoTracks } from "@/lib/demoTracks";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { id: string } }) {
  let title = "Epic Music Space";
  let artist = "Independent music marketplace";
  let coverUrl: string | null = null;
  let licensePrice: number | null = null;

  try {
    const song = await prisma.song.findUnique({
      where: { id: params.id },
      select: { title: true, artist: true, coverUrl: true, licensePrice: true },
    });
    if (song) {
      title = song.title;
      artist = song.artist;
      coverUrl = song.coverUrl ?? null;
      licensePrice = Number(song.licensePrice);
    } else {
      const demos = await getDemoTracks();
      const demo = demos.find((d) => d.id === params.id);
      if (demo) {
        title = demo.title;
        artist = demo.artist;
        coverUrl = demo.coverUrl ?? null;
        licensePrice = Number(demo.licensePrice);
      }
    }
  } catch {
    /* fall through to defaults */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a14 0%, #1a0f2e 50%, #0a0a14 100%)",
          display: "flex",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 60,
        }}
      >
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            width={500}
            height={500}
            style={{ borderRadius: 32, marginRight: 60, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", objectFit: "cover" }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                fontSize: 20,
                color: "#00F5FF",
              }}
            >
              ♫
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: "#a78bfa" }}>
              Epic Music Space
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.05, marginBottom: 16 }}>{title}</div>
            <div style={{ fontSize: 32, color: "rgba(255,255,255,0.65)" }}>by {artist}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {licensePrice !== null && (
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "rgba(108,92,231,0.18)",
                  border: "1px solid rgba(108,92,231,0.45)",
                  color: "#a78bfa",
                }}
              >
                License from ${licensePrice.toFixed(0)}
              </div>
            )}
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.45)" }}>
              Listen, license, and own — epicmusicspace.com
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

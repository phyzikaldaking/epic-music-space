import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { username: string } }) {
  let displayName = "Epic Music Space artist";
  let username = params.username;
  let bio: string | null = null;
  let avatarUrl: string | null = null;
  let bannerUrl: string | null = null;
  let songCount = 0;
  let followerCount = 0;

  try {
    const studio = await prisma.studio.findUnique({
      where: { username: params.username },
      select: {
        username: true,
        bio: true,
        bannerUrl: true,
        user: {
          select: {
            name: true,
            image: true,
            _count: { select: { followers: true, songs: true } },
          },
        },
      },
    });
    if (studio) {
      username = studio.username;
      displayName = studio.user.name ?? studio.username;
      bio = studio.bio;
      avatarUrl = studio.user.image ?? null;
      bannerUrl = studio.bannerUrl ?? null;
      followerCount = studio.user._count.followers;
      songCount = studio.user._count.songs;
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
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a14 0%, #1a0f2e 50%, #0a0a14 100%)",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            width={1200}
            height={300}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: 300,
              objectFit: "cover",
              opacity: 0.45,
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 300,
            background: "linear-gradient(180deg, rgba(10,10,20,0.2) 0%, rgba(10,10,20,1) 100%)",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            flex: 1,
            padding: 60,
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                width={160}
                height={160}
                style={{
                  borderRadius: 999,
                  border: "4px solid rgba(108,92,231,0.6)",
                  objectFit: "cover",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                }}
              />
            ) : (
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #6c5ce7, #00F5FF)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 64,
                }}
              >
                🎤
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05, marginBottom: 8 }}>
                {displayName}
              </div>
              <div style={{ fontSize: 26, color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>
                @{username}
              </div>
              {bio && (
                <div
                  style={{
                    fontSize: 20,
                    color: "rgba(255,255,255,0.7)",
                    maxWidth: 800,
                    lineHeight: 1.35,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {bio}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(108,92,231,0.18)",
                border: "1px solid rgba(108,92,231,0.45)",
                color: "#a78bfa",
              }}
            >
              {songCount} {songCount === 1 ? "track" : "tracks"}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(0,245,255,0.12)",
                border: "1px solid rgba(0,245,255,0.35)",
                color: "#5ee9f5",
              }}
            >
              {followerCount} {followerCount === 1 ? "follower" : "followers"}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

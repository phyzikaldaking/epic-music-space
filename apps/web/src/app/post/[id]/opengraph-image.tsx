import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { id: string } }) {
  let body = "Posted on Epic Music Space";
  let authorName = "Artist";
  let authorAvatar: string | null = null;
  let imageUrl: string | null = null;
  let songTitle: string | null = null;
  let songArtist: string | null = null;
  let songCover: string | null = null;
  let likeCount = 0;
  let commentCount = 0;
  let hasVideo = false;

  try {
    const post = await prisma.post.findUnique({
      where: { id: params.id },
      select: {
        body: true,
        imageUrl: true,
        songId: true,
        muxPlaybackId: true,
        videoStatus: true,
        author: { select: { name: true, image: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (post) {
      body = post.body || body;
      authorName = post.author.name ?? authorName;
      authorAvatar = post.author.image ?? null;
      imageUrl = post.imageUrl ?? null;
      hasVideo = post.videoStatus === "READY" && !!post.muxPlaybackId;
      likeCount = post._count.likes;
      commentCount = post._count.comments;
      if (post.songId) {
        const song = await prisma.song.findUnique({
          where: { id: post.songId },
          select: { title: true, artist: true, coverUrl: true },
        });
        if (song) {
          songTitle = song.title;
          songArtist = song.artist;
          songCover = song.coverUrl ?? null;
        }
      }
    }
  } catch {
    /* fall through to defaults */
  }

  const truncated = body.length > 220 ? `${body.slice(0, 220).trim()}…` : body;
  const mediaThumb = imageUrl ?? songCover ?? null;

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
        {mediaThumb && (
          <img
            src={mediaThumb}
            alt=""
            width={420}
            height={420}
            style={{
              borderRadius: 28,
              marginRight: 56,
              objectFit: "cover",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {authorAvatar ? (
                <img
                  src={authorAvatar}
                  alt=""
                  width={56}
                  height={56}
                  style={{ borderRadius: 999, objectFit: "cover", border: "2px solid rgba(108,92,231,0.6)" }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: "linear-gradient(135deg, #6c5ce7, #00F5FF)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                  }}
                >
                  🎤
                </div>
              )}
              <div style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
                {authorName}
              </div>
            </div>

            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                lineHeight: 1.2,
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {truncated}
            </div>

            {(songTitle || hasVideo) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 18,
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                {songTitle ? (
                  <>
                    <span aria-hidden style={{ fontSize: 22 }}>🎵</span>
                    <span>
                      {songTitle}
                      {songArtist ? ` · ${songArtist}` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span aria-hidden style={{ fontSize: 22 }}>🎬</span>
                    <span>Video</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(236,72,153,0.15)",
                border: "1px solid rgba(236,72,153,0.4)",
                color: "#f9a8d4",
              }}
            >
              ♥ {likeCount}
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
              💬 {commentCount}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

/**
 * oEmbed discovery endpoint (https://oembed.com/) so platforms like
 * WordPress, Discord, Slack, and Notion can auto-render a track URL as
 * the embeddable player. Spec keeps the response shape narrow — we
 * return the "rich" type since we serve an iframe, not a static image.
 *
 * Example consumer call:
 *   GET /api/oembed?url=https://epicmusicspace.com/track/abc123
 */
export const runtime = "nodejs";
export const revalidate = 300;

const TRACK_PATH = /^\/track\/([a-zA-Z0-9_-]{1,40})\/?$/;

function parseTrackId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Accept both the configured site host and any host the request itself
  // arrived on. We don't gate on host strictly because the site may be
  // reachable on multiple domains during a launch (apex + www).
  const match = parsed.pathname.match(TRACK_PATH);
  return match?.[1] ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const format = (searchParams.get("format") ?? "json").toLowerCase();
  const maxWidth = Number(searchParams.get("maxwidth") ?? 600);
  const maxHeight = Number(searchParams.get("maxheight") ?? 160);

  if (!url) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }
  if (format !== "json") {
    // Spec allows xml, but no consumer worth supporting still requests it.
    return NextResponse.json({ error: "only json format is supported" }, { status: 501 });
  }

  const trackId = parseTrackId(url);
  if (!trackId) {
    return NextResponse.json({ error: "url is not a track page" }, { status: 404 });
  }

  const song = await prisma.song.findUnique({
    where: { id: trackId },
    select: {
      id: true,
      title: true,
      artist: true,
      coverUrl: true,
      isActive: true,
      isDraft: true,
    },
  });
  if (!song || !song.isActive || song.isDraft) {
    return NextResponse.json({ error: "track not found" }, { status: 404 });
  }

  const site = getSiteUrl();
  const embedUrl = `${site}/track/${song.id}/embed`;
  const safeMaxWidth = Math.max(280, Math.min(800, Number.isFinite(maxWidth) ? maxWidth : 600));
  const safeMaxHeight = Math.max(120, Math.min(240, Number.isFinite(maxHeight) ? maxHeight : 160));

  return NextResponse.json(
    {
      version: "1.0",
      type: "rich",
      provider_name: "Epic Music Space",
      provider_url: site,
      title: song.title,
      author_name: song.artist,
      author_url: `${site}/track/${song.id}`,
      thumbnail_url: song.coverUrl ?? undefined,
      width: safeMaxWidth,
      height: safeMaxHeight,
      html: `<iframe src="${embedUrl}" width="${safeMaxWidth}" height="${safeMaxHeight}" frameborder="0" allow="autoplay; clipboard-write" loading="lazy" title="${escapeHtml(song.title)} on Epic Music Space"></iframe>`,
      cache_age: 300,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    },
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

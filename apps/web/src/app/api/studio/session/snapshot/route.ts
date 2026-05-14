import { NextResponse } from "next/server";
import { z } from "zod";
import { listRecentStudioSnapshots, readStudioSnapshot, writeStudioSnapshot } from "@/lib/studioSnapshots";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";

export const dynamic = "force-dynamic";

const snapshotSchema = z.object({
  sessionId: z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:@-]+$/),
  roomId: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/).default("ems-main-room"),
  mode: z.string().max(40).optional(),
  selectedTrack: z.string().max(160).optional(),
  bpm: z.number().int().min(40).max(240).optional(),
  bar: z.number().int().min(1).max(10000).optional(),
  playing: z.boolean().optional(),
  tracks: z.array(z.unknown()).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  const limit = checkCollabRateLimit(request, "studio-snapshot-read", 60, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many snapshot reads" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const roomId = url.searchParams.get("roomId") ?? "ems-main-room";
  if (sessionId) {
    const snapshot = await readStudioSnapshot(sessionId).catch(() => null);
    return NextResponse.json({ snapshot, backend: snapshot ? "database" : "none" }, { headers: collabRateLimitHeaders(limit) });
  }
  const recent = await listRecentStudioSnapshots(roomId, 5).catch(() => []);
  return NextResponse.json({ roomId, recent, backend: recent.length ? "database" : "none" }, { headers: collabRateLimitHeaders(limit) });
}

export async function POST(request: Request) {
  const limit = checkCollabRateLimit(request, "studio-snapshot-write", 30, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many snapshot writes" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  const raw = await request.json().catch(() => ({}));
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid studio snapshot", issues: parsed.error.flatten() }, { status: 400, headers: collabRateLimitHeaders(limit) });
  const snapshot = await writeStudioSnapshot(parsed.data).catch(() => null);
  return NextResponse.json({ ok: Boolean(snapshot), snapshot, backend: snapshot ? "database" : "none" }, { headers: collabRateLimitHeaders(limit) });
}

import { NextResponse } from "next/server";
import { readDurableCollabAudit } from "@/lib/collabDurableState";
import { roomIdSchema } from "@/lib/collabSecurity";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = checkCollabRateLimit(request, "collab-audit-read", 30, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many audit reads" }, { status: 429, headers: collabRateLimitHeaders(limit) });

  const url = new URL(request.url);
  const roomId = roomIdSchema.safeParse(url.searchParams.get("roomId") ?? "ems-main-room");
  if (!roomId.success) return NextResponse.json({ error: "Invalid roomId" }, { status: 400, headers: collabRateLimitHeaders(limit) });

  const rows = await readDurableCollabAudit(roomId.data, 50).catch(() => []);
  return NextResponse.json({ roomId: roomId.data, audit: rows.map((row) => ({ id: row.id, action: row.action, detail: row.detail, actor: row.actor, metadata: row.metadata, createdAt: row.created_at.toISOString() })) }, { headers: collabRateLimitHeaders(limit) });
}

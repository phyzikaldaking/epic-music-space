import { NextRequest, NextResponse } from "next/server";
import { deleteBeatPattern, listBeatPatterns, saveBeatPattern } from "@/lib/beatPatternStore";

const DEFAULT_PROJECT_ID = "ems-default-project";
const DEFAULT_SESSION_ID = "ems-beat-machine-session";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") || DEFAULT_PROJECT_ID;
  const limit = Number(request.nextUrl.searchParams.get("limit") || 25);
  const patterns = await listBeatPatterns(projectId, Math.min(Math.max(limit, 1), 50));
  return NextResponse.json({ ok: true, patterns });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !body.name || !Array.isArray(body.tracks)) {
    return NextResponse.json({ ok: false, error: "Pattern name and tracks are required." }, { status: 400 });
  }
  const pattern = await saveBeatPattern({
    id: typeof body.id === "string" ? body.id : undefined,
    projectId: typeof body.projectId === "string" ? body.projectId : DEFAULT_PROJECT_ID,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : DEFAULT_SESSION_ID,
    name: String(body.name),
    bpm: Number(body.bpm || 92),
    swing: Number(body.swing || 0),
    tracks: body.tracks,
    arrangement: Array.isArray(body.arrangement) ? body.arrangement : [],
  });
  return NextResponse.json({ ok: true, pattern });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = body?.id || request.nextUrl.searchParams.get("id");
  const projectId = body?.projectId || request.nextUrl.searchParams.get("projectId") || DEFAULT_PROJECT_ID;
  if (!id) return NextResponse.json({ ok: false, error: "Pattern id is required." }, { status: 400 });
  const result = await deleteBeatPattern(String(id), String(projectId));
  return NextResponse.json({ ok: true, result });
}

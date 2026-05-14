import { NextResponse } from "next/server";
import { z } from "zod";
import { appendStudioOperation, listStudioOperations, readStudioRealtimeState } from "@/lib/studioRealtimeState";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";

export const dynamic = "force-dynamic";

const sessionSchema = z.string().min(1).max(180).regex(/^[a-zA-Z0-9_.:@-]+$/);
const projectSchema = z.string().min(1).max(180).regex(/^[a-zA-Z0-9_.:@-]+$/).default("ems-default-project");

const opSchema = z.object({
  id: z.string().min(1).max(220).optional(),
  sessionId: sessionSchema,
  projectId: projectSchema.optional(),
  actorId: z.string().max(180).optional(),
  clientId: z.string().max(180).optional(),
  baseRevision: z.number().int().min(0).optional(),
  type: z.enum(["state.patch", "track.upsert", "track.delete", "transport.patch", "selection.set", "beat.pattern", "midi.event", "undo", "redo"]),
  target: z.string().max(220).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  const limit = checkCollabRateLimit(request, "studio-realtime-read", 120, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many realtime reads" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  const url = new URL(request.url);
  const session = sessionSchema.safeParse(url.searchParams.get("sessionId") ?? "ems-main-session");
  const project = projectSchema.safeParse(url.searchParams.get("projectId") ?? "ems-default-project");
  const afterRevision = Number(url.searchParams.get("afterRevision") ?? 0);
  if (!session.success || !project.success) return NextResponse.json({ error: "Invalid session or project" }, { status: 400, headers: collabRateLimitHeaders(limit) });
  const state = await readStudioRealtimeState(session.data, project.data).catch(() => null);
  const operations = await listStudioOperations(session.data, Number.isFinite(afterRevision) ? afterRevision : 0, 100).catch(() => []);
  return NextResponse.json({ state, operations }, { headers: collabRateLimitHeaders(limit) });
}

export async function POST(request: Request) {
  const limit = checkCollabRateLimit(request, "studio-realtime-write", 90, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many realtime writes" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  const raw = await request.json().catch(() => ({}));
  const parsed = opSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid studio operation", issues: parsed.error.flatten() }, { status: 400, headers: collabRateLimitHeaders(limit) });
  const result = await appendStudioOperation(parsed.data).catch((error) => ({ error: error instanceof Error ? error.message : "Realtime operation failed" }));
  return NextResponse.json(result, { headers: collabRateLimitHeaders(limit) });
}

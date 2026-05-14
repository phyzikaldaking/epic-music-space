import { NextResponse } from "next/server";
import { z } from "zod";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";

export const dynamic = "force-dynamic";

const midiSchema = z.object({
  sessionId: z.string().min(1).max(180).default("ems-main-session"),
  deviceId: z.string().max(180).optional(),
  type: z.enum(["note_on", "note_off", "cc", "transport"]),
  note: z.number().int().min(0).max(127).optional(),
  velocity: z.number().min(0).max(1).optional(),
  controller: z.number().int().min(0).max(127).optional(),
  value: z.number().min(0).max(1).optional(),
  channel: z.number().int().min(1).max(16).optional(),
});

export async function POST(request: Request) {
  const limit = checkCollabRateLimit(request, "studio-midi-event", 240, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many MIDI events" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  const raw = await request.json().catch(() => ({}));
  const parsed = midiSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid MIDI event", issues: parsed.error.flatten() }, { status: 400, headers: collabRateLimitHeaders(limit) });
  return NextResponse.json({ accepted: true, event: { id: `midi-${Date.now()}-${crypto.randomUUID()}`, ...parsed.data, createdAt: new Date().toISOString() } }, { headers: collabRateLimitHeaders(limit) });
}

export async function GET() {
  return NextResponse.json({ devices: [], message: "Browser Web MIDI client bridge endpoint ready." });
}

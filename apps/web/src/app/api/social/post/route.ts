import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalOrAuth } from "@/lib/internalAuth";
import { rateLimit } from "@/lib/rateLimitInline";

const schema = z.object({
  clipId: z.string(),
  caption: z.string().optional(),
  platform: z.enum(["tiktok", "instagram", "youtube"]).default("tiktok"),
});

export async function POST(req: Request) {
  const authz = await requireInternalOrAuth(req);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const limitKey = authz.userId ?? "internal";
  const blocked = await rateLimit("strict", `social:post:${limitKey}`);
  if (blocked) return blocked;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid social post request" }, { status: 400 });
  }

  return NextResponse.json({
    status: "needs_connection",
    message: `Connect ${parsed.data.platform} before publishing social posts. Your draft was not sent.`,
    requiresConnection: true,
    payload: parsed.data,
  }, { status: 424 });
}

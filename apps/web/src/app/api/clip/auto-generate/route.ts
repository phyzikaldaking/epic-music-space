import { NextResponse } from "next/server";
import { generateAutoClips } from "@/lib/autoClipper";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.songId) {
    return NextResponse.json({ error: "Missing song data" }, { status: 400 });
  }

  const clips = generateAutoClips(body);

  return NextResponse.json({
    status: "ok",
    clips,
  });
}

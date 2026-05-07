import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pollMastering } from "@/lib/aiMastering";

/**
 * GET /api/mastering/status?id=<predictionId>
 *
 * Polled fallback for long-running mastering jobs that didn't finish
 * within the 90s synchronous window of /api/mastering/render.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  try {
    const result = await pollMastering(id);
    return NextResponse.json({
      status: result.status,
      masteredUrl: result.output ?? null,
      error: result.error ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "poll failed" },
      { status: 502 },
    );
  }
}

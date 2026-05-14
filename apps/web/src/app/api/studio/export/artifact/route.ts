import { NextRequest, NextResponse } from "next/server";
import { getAudioExportArtifact } from "@/lib/studioExportRenderer";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? "demo-user";
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });
  }

  const artifact = await getAudioExportArtifact(jobId, userId);

  if (!artifact) {
    return NextResponse.json({ ok: false, error: "Artifact not found" }, { status: 404 });
  }

  return new NextResponse(artifact.data, {
    headers: {
      "Content-Type": artifact.mimeType,
      "Content-Disposition": `attachment; filename="${artifact.filename.replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}

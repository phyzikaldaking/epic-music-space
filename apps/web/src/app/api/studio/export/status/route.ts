import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/studio/export/status?jobId=...
 * Polls the status of a queued export job.
 * Returns: { jobId, status: "queued"|"processing"|"done"|"failed", url?, error? }
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return jsonWithRequestId(requestId, { error: "jobId query param is required" }, { status: 400 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase
      .from("export_jobs")
      .select("id, status, output_url, error_message, created_at, updated_at")
      .eq("id", jobId)
      .eq("user_id", (session as { user: { id: string } }).user.id)
      .single();

    if (error || !data) {
      return jsonWithRequestId(requestId, { error: "Job not found" }, { status: 404 });
    }

    return jsonWithRequestId(requestId, {
      jobId: data.id,
      status: data.status,
      url: data.output_url ?? null,
      error: data.error_message ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (err) {
    console.error("[export/status] error", err);
    return jsonWithRequestId(requestId, { error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Add a timestamped comment to a draft
 * POST body: { projectId, authorId, text, timestamp }
 */

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      projectId?: string;
      authorId?: string;
      text?: string;
      timestamp?: number;
    };

    const { projectId, authorId, text, timestamp = 0 } = body;

    if (!projectId || !authorId || !text) {
      return jsonWithRequestId(
        requestId,
        { error: "projectId, authorId, and text required" },
        { status: 400 }
      );
    }

    // Full implementation:
    // 1. Store comment in database (DraftComment table)
    // 2. Broadcast via Supabase realtime on channel: draft:{projectId}
    // 3. Increment comment count on project
    // 4. Return comment with ID + metadata

    const commentId = `comment-${Date.now()}`;

    return jsonWithRequestId(
      requestId,
      {
        id: commentId,
        authorId,
        authorName: "Collaborator",
        text,
        timestamp,
        createdAt: new Date(),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[drafts/comments]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Comment failed" },
      { status: 500 }
    );
  }
}

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

// Authorization gate for the Yjs collab channel (#12). The browser cannot
// be trusted to enforce who joins a project's CRDT broadcast — anyone with
// a Supabase anon JWT can technically subscribe to any channel. This
// endpoint is the server-side check the client calls before mounting the
// provider. It returns 200 only when the caller is allowed to *edit*; the
// actual broadcast is still open — Supabase realtime channels aren't
// authoritative — but the client won't subscribe-with-write without a
// green light, and a future Supabase RLS policy can mirror this check at
// the transport layer.
//
// Three paths to write access:
//   1. The caller owns the project.
//   2. The project has an active linked live Room AND the caller is a
//      HOST or SPEAKER in that room (Clubhouse-style "stage seats edit").
//   3. (Future) Caller is on a per-project collaborator list.
//
// Audience (LISTENER) members of a linked room get `ok: true` with
// `writable: false`, so the client can mount a read-only spectator view.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.studioProject.findUnique({
    where: { id },
    select: {
      userId: true,
      liveRoom: {
        select: {
          id: true,
          status: true,
          participants: {
            where: { userId: session.user.id, leftAt: null },
            select: { role: true },
          },
        },
      },
    },
  });
  if (!project) {
    // Don't leak existence — same 404 for "missing" and "not yours."
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }

  const isOwner = project.userId === session.user.id;
  const roomRole = project.liveRoom?.status === "LIVE"
    ? project.liveRoom.participants[0]?.role ?? null
    : null;
  const isOnStage = roomRole === "HOST" || roomRole === "SPEAKER";
  const isAudience = roomRole === "LISTENER";

  if (!isOwner && !isOnStage && !isAudience) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }

  // Channel name the client should subscribe to. Keeping it derivable
  // from the project id keeps the API simple; a future hardened version
  // would mint a signed nonce here.
  return jsonWithRequestId(requestId, {
    channel: `ems:studio:project:${id}`,
    ok: true,
    // Stage seats + owner can write. Audience can only observe.
    writable: isOwner || isOnStage,
    role: isOwner ? "OWNER" : roomRole,
  });
}

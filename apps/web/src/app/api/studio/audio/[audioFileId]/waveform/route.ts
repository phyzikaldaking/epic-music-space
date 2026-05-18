import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";
import { readJsonBodyLimited } from "@/lib/apiHardening";

const waveformSchema = z.object({
  peaks: z.array(z.number().min(0).max(1)).max(10000).optional(),
  waveform: z.object({
    version: z.number().optional(),
    mono: z.array(z.number().min(0).max(1)).max(10000),
    channels: z.array(z.array(z.number().min(0).max(1)).max(10000)).max(8).optional(),
    resolution: z.number().int().min(1).max(10000).optional(),
    normalizedAt: z.string().optional(),
  }).optional(),
  cacheKey: z.string().max(200).optional(),
});

async function getAudioAccess(audioFileId: string, userId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; projectId: string; userId: string }>>`
    select a.id, a."projectId", p."userId"
    from "StudioAudioFile" a
    join "StudioProject" p on p.id = a."projectId"
    where a.id = ${audioFileId}
    limit 1
  `;
  const audio = rows[0];
  if (!audio) return { ok: false as const, status: 404, error: "Audio file not found" };
  if (audio.userId !== userId) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, audio };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ audioFileId: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });

  const { audioFileId } = await params;
  const access = await getAudioAccess(audioFileId, session.user.id);
  if (!access.ok) return jsonWithRequestId(requestId, { error: access.error }, { status: access.status });

  const rows = await prisma.$queryRaw<Array<{ waveformPeaks: unknown; peaksJson: unknown; updatedAt: Date }>>`
    select "waveformPeaks", "peaksJson", "updatedAt"
    from "StudioAudioFile"
    where id = ${audioFileId}
    limit 1
  `;

  return jsonWithRequestId(requestId, {
    audioFileId,
    waveform: rows[0]?.waveformPeaks ?? rows[0]?.peaksJson ?? null,
    updatedAt: rows[0]?.updatedAt ?? null,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ audioFileId: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });

  const { audioFileId } = await params;
  const access = await getAudioAccess(audioFileId, session.user.id);
  if (!access.ok) return jsonWithRequestId(requestId, { error: access.error }, { status: access.status });

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 512 * 1024,
    invalidMessage: "Expected JSON waveform body",
  });
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = waveformSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(requestId, { error: parsed.error.issues[0]?.message ?? "Invalid waveform" }, { status: 400 });
  }

  const waveform = parsed.data.waveform ?? {
    version: 1,
    mono: parsed.data.peaks ?? [],
    resolution: parsed.data.peaks?.length ?? 0,
    normalizedAt: new Date().toISOString(),
  };

  await prisma.$executeRaw`
    update "StudioAudioFile"
    set "waveformPeaks" = ${waveform as object}, "peaksJson" = ${waveform.mono as object}, "updatedAt" = current_timestamp
    where id = ${audioFileId}
  `;

  return jsonWithRequestId(requestId, { ok: true, audioFileId, cacheKey: parsed.data.cacheKey ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ audioFileId: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });

  const { audioFileId } = await params;
  const access = await getAudioAccess(audioFileId, session.user.id);
  if (!access.ok) return jsonWithRequestId(requestId, { error: access.error }, { status: access.status });

  return jsonWithRequestId(requestId, {
    error: "Server-side waveform generation is not configured yet.",
    next: "Connect this route to the FFmpeg/audio worker and write normalized peaks back with PUT.",
    audioFileId,
  }, { status: 501 });
}

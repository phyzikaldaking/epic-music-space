import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

/**
 * Split sheet for a song. Lifecycle:
 *   POST   — create from a list of collaborators (typically the studio
 *            session presence at publish time). Defaults to equal shares.
 *            Idempotent: returns the existing draft if one already exists.
 *   GET    — read the current sheet (any collaborator can read).
 *   PATCH  — overwrite entries (artist only, only while DRAFT).
 *   POST?action=sign — flip DRAFT → SIGNED (artist only, must sum to 10000 bps).
 *
 * shareBps = basis points. 10000 = 100%. Sum across entries must equal 10000.
 */

const collaboratorSchema = z.object({
  userId: z.string().min(1).max(64).optional(),
  displayName: z.string().min(1).max(80),
  role: z.enum(["ARTIST", "WRITER", "PRODUCER", "ENGINEER", "FEATURE"]).default("WRITER"),
  inviteEmail: z.string().email().max(120).optional(),
});

const createSchema = z.object({
  collaborators: z.array(collaboratorSchema).min(1).max(20),
  sessionId: z.string().max(64).optional(),
});

const patchEntrySchema = z.object({
  id: z.string().optional(), // when omitted, treated as a new entry
  userId: z.string().min(1).max(64).nullable().optional(),
  displayName: z.string().min(1).max(80),
  role: z.enum(["ARTIST", "WRITER", "PRODUCER", "ENGINEER", "FEATURE"]),
  shareBps: z.coerce.number().int().min(0).max(10000),
  inviteEmail: z.string().email().max(120).nullable().optional(),
});

const patchSchema = z.object({
  entries: z.array(patchEntrySchema).min(1).max(20),
});

const TOTAL_BPS = 10000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: songId } = await params;

  // Authorization: a split sheet can be read by either the song's
  // artist OR any collaborator listed on it. Names + invite emails are
  // sensitive PII; never expose them to random authed users browsing
  // the API.
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, artistId: true },
  });
  if (!song) {
    return NextResponse.json({ error: "song not found" }, { status: 404 });
  }

  const sheet = await prisma.splitSheet.findUnique({
    where: { songId },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          role: true,
          shareBps: true,
          inviteEmail: true,
        },
      },
    },
  });
  if (!sheet) {
    return NextResponse.json({ sheet: null }, { status: 200 });
  }

  const isArtist = song.artistId === session.user.id;
  const isOnSheet = sheet.entries.some((e) => e.userId === session.user.id);
  if (!isArtist && !isOnSheet) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ sheet });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: songId } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, artistId: true, title: true },
  });
  if (!song) {
    return NextResponse.json({ error: "song not found" }, { status: 404 });
  }
  if (song.artistId !== session.user.id) {
    return NextResponse.json({ error: "only the artist can manage split sheets" }, { status: 403 });
  }

  // Sign action — flips DRAFT → SIGNED. Validates that entries sum to 10000.
  if (action === "sign") {
    const sheet = await prisma.splitSheet.findUnique({
      where: { songId },
      include: { entries: true },
    });
    if (!sheet) {
      return NextResponse.json({ error: "no draft sheet to sign" }, { status: 404 });
    }
    if (sheet.status !== "DRAFT") {
      return NextResponse.json({ error: `sheet is ${sheet.status}` }, { status: 409 });
    }
    const total = sheet.entries.reduce((sum, e) => sum + e.shareBps, 0);
    if (total !== TOTAL_BPS) {
      return NextResponse.json(
        { error: `entries sum to ${total} bps; must equal ${TOTAL_BPS}` },
        { status: 400 },
      );
    }
    const signed = await prisma.splitSheet.update({
      where: { id: sheet.id },
      data: { status: "SIGNED", signedAt: new Date() },
      include: { entries: true },
    });
    return NextResponse.json({ sheet: signed });
  }

  // Default action — create. Idempotent on songId (returns the existing
  // draft if one is already there).
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const existing = await prisma.splitSheet.findUnique({
    where: { songId },
    include: { entries: true },
  });
  if (existing) {
    return NextResponse.json({ sheet: existing }, { status: 200 });
  }

  const collaborators = body.collaborators;
  // Equal-share default. Last entry absorbs any remainder so rows sum to 10000.
  const baseShare = Math.floor(TOTAL_BPS / collaborators.length);
  const remainder = TOTAL_BPS - baseShare * collaborators.length;

  const sheet = await prisma.splitSheet.create({
    data: {
      songId,
      status: "DRAFT",
      createdFromSessionId: body.sessionId ?? null,
      entries: {
        create: collaborators.map((c, index) => ({
          userId: c.userId ?? null,
          displayName: c.displayName,
          role: c.role,
          shareBps: baseShare + (index === collaborators.length - 1 ? remainder : 0),
          inviteEmail: c.inviteEmail ?? null,
        })),
      },
    },
    include: { entries: true },
  });

  return NextResponse.json({ sheet }, { status: 201 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: songId } = await params;

  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, artistId: true },
  });
  if (!song) {
    return NextResponse.json({ error: "song not found" }, { status: 404 });
  }
  if (song.artistId !== session.user.id) {
    return NextResponse.json({ error: "only the artist can edit split sheets" }, { status: 403 });
  }

  const sheet = await prisma.splitSheet.findUnique({
    where: { songId },
    select: { id: true, status: true },
  });
  if (!sheet) {
    return NextResponse.json({ error: "no sheet" }, { status: 404 });
  }
  if (sheet.status !== "DRAFT") {
    return NextResponse.json({ error: `sheet is ${sheet.status}; only DRAFT is editable` }, { status: 409 });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Replace strategy: drop existing entries and re-create. Simpler than
  // diffing and avoids subtle bugs around partial updates while sums
  // are momentarily off.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.splitSheetEntry.deleteMany({ where: { sheetId: sheet.id } });
    await tx.splitSheetEntry.createMany({
      data: body.entries.map((e) => ({
        sheetId: sheet.id,
        userId: e.userId ?? null,
        displayName: e.displayName,
        role: e.role,
        shareBps: e.shareBps,
        inviteEmail: e.inviteEmail ?? null,
      })),
    });
    return tx.splitSheet.findUnique({
      where: { id: sheet.id },
      include: { entries: { orderBy: { createdAt: "asc" } } },
    });
  });

  return NextResponse.json({ sheet: updated });
}

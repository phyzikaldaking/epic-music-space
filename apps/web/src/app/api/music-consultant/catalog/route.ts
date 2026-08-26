import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const clean = (v: unknown, max = 500) => typeof v === "string" ? v.trim().slice(0, max) : undefined;
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = clean(new URL(req.url).searchParams.get("q"), 100);
  const songs = await prisma.rightsSong.findMany({
    where: { ownerId: session.user.id, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
    include: { reminders: true, reviews: true, documents: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } } },
    orderBy: { updatedAt: "desc" }, take: 100,
  });
  const duplicateGroups = songs.reduce<Record<string, string[]>>((out, song) => {
    const key = normalize(song.title) + "|" + normalize(song.artistName ?? "");
    (out[key] ??= []).push(song.id);
    return out;
  }, {});
  return NextResponse.json({ songs, duplicates: Object.values(duplicateGroups).filter(ids => ids.length > 1) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || body.kind !== "song") return NextResponse.json({ error: "kind must be song" }, { status: 400 });
  const title = clean(body.title, 200);
  if (!title) return NextResponse.json({ error: "Song title is required" }, { status: 400 });
  const song = await prisma.rightsSong.create({
    data: {
      ownerId: session.user.id, title, artistName: clean(body.artistName, 200),
      isrc: clean(body.isrc, 20), upc: clean(body.upc, 20), ipi: clean(body.ipi, 30),
      cae: clean(body.cae, 30), territory: clean(body.territory, 80),
      releaseDate: typeof body.releaseDate === "string" ? new Date(body.releaseDate) : undefined,
      rights: Array.isArray(body.rights) ? body.rights.slice(0, 30) : [],
      writers: Array.isArray(body.writers) ? body.writers.slice(0, 100) : [],
      licenseChecklist: body.licenseChecklist && typeof body.licenseChecklist === "object" ? body.licenseChecklist : {},
    },
  });
  const all = await prisma.rightsSong.findMany({ where: { ownerId: session.user.id }, select: { id: true, title: true, artistName: true, isrc: true, upc: true } });
  const duplicates = all.filter(s => s.id !== song.id && ((song.isrc && s.isrc === song.isrc) || (song.upc && s.upc === song.upc) || (normalize(s.title) === normalize(song.title) && normalize(s.artistName ?? "") === normalize(song.artistName ?? ""))));
  return NextResponse.json({ song, duplicates }, { status: 201 });
}

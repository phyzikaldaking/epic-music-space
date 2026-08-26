import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ reminders: await prisma.rightsReminder.findMany({ where: { ownerId: session.user.id }, orderBy: { dueAt: "asc" }, take: 100 }) });
}
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { title?: string; dueAt?: string; provider?: string; songId?: string } | null;
  if (!body?.title || !body.dueAt || Number.isNaN(Date.parse(body.dueAt))) return NextResponse.json({ error: "title and valid dueAt are required" }, { status: 400 });
  if (body.songId && !(await prisma.rightsSong.findFirst({ where: { id: body.songId, ownerId: session.user.id }, select: { id: true } }))) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  const reminder = await prisma.rightsReminder.create({ data: { ownerId: session.user.id, title: body.title.slice(0, 200), dueAt: new Date(body.dueAt), provider: body.provider?.slice(0, 80), songId: body.songId } });
  return NextResponse.json({ reminder }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const license = await prisma.licenseToken.findUnique({
    where: { id },
    include: { song: { select: { stemUrl: true, hasStems: true, title: true } } },
  });

  if (!license) {
    return NextResponse.json({ error: "License not found" }, { status: 404 });
  }

  if (license.holderId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (license.status !== "ACTIVE") {
    return NextResponse.json({ error: "License is not active" }, { status: 403 });
  }

  if (!license.song.hasStems || !license.song.stemUrl) {
    return NextResponse.json(
      { error: "No download available for this track" },
      { status: 404 }
    );
  }

  return NextResponse.redirect(license.song.stemUrl);
}

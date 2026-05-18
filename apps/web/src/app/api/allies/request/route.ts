import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const db = prisma as typeof prisma & {
  allyConnection?: {
    upsert: (args: unknown) => Promise<unknown>;
  };
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db.allyConnection) {
    return NextResponse.json({ error: "Ally relationships are not available until the EMS relationship schema is generated." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const receiverId = typeof body.receiverId === "string" ? body.receiverId : null;

  if (!receiverId) {
    return NextResponse.json({ error: "receiverId is required" }, { status: 400 });
  }

  if (receiverId === session.user.id) {
    return NextResponse.json({ error: "You cannot add yourself as an Ally." }, { status: 400 });
  }

  const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true } });
  if (!receiver) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const requestRecord = await db.allyConnection.upsert({
      where: {
        requesterId_receiverId: {
          requesterId: session.user.id,
          receiverId,
        },
      },
      update: {
        status: "PENDING",
        acceptedAt: null,
      },
      create: {
        requesterId: session.user.id,
        receiverId,
        status: "PENDING",
      },
    });

    return NextResponse.json({ ok: true, allyRequest: requestRecord });
  } catch (error) {
    console.error("ally_request_error", error);
    return NextResponse.json({ error: "Could not send Ally request" }, { status: 500 });
  }
}

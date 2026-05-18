import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const db = prisma as typeof prisma & {
  clientRelationship?: {
    upsert: (args: unknown) => Promise<unknown>;
  };
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db.clientRelationship) {
    return NextResponse.json({ error: "Client relationships are not available until the EMS relationship schema is generated." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));

  const artistId = typeof body.artistId === "string" ? body.artistId : null;
  const source = typeof body.source === "string" ? body.source : "DIRECT";

  if (!artistId) {
    return NextResponse.json({ error: "artistId is required" }, { status: 400 });
  }

  if (artistId === session.user.id) {
    return NextResponse.json({ error: "You cannot create a client relationship with yourself." }, { status: 400 });
  }

  try {
    const relationship = await db.clientRelationship.upsert({
      where: {
        artistId_userId: {
          artistId,
          userId: session.user.id,
        },
      },
      update: {
        source,
        lastOrderAt: new Date(),
      },
      create: {
        artistId,
        userId: session.user.id,
        source,
        lastOrderAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, relationship });
  } catch (error) {
    console.error("client_relationship_error", error);
    return NextResponse.json({ error: "Could not create client relationship" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireArtistByHandle } from "@/lib/emsRelationshipResolvers";

const db = prisma as typeof prisma & {
  stakeholderAccess?: {
    upsert: (args: unknown) => Promise<unknown>;
  };
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db.stakeholderAccess) {
    return NextResponse.json({ error: "Stakeholder Access is not available until the EMS relationship schema is generated." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const handle = typeof body.handle === "string" ? body.handle : null;
  const tier = typeof body.tier === "string" ? body.tier : "STAKEHOLDER";

  if (!handle) {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  try {
    const artist = await requireArtistByHandle(handle);

    if (artist.id === session.user.id) {
      return NextResponse.json({ error: "You cannot become your own Stakeholder." }, { status: 400 });
    }

    const stakeholderAccess = await db.stakeholderAccess.upsert({
      where: {
        artistId_userId: {
          artistId: artist.id,
          userId: session.user.id,
        },
      },
      update: {
        tier,
        status: "ACTIVE",
        endedAt: null,
      },
      create: {
        artistId: artist.id,
        userId: session.user.id,
        tier,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ ok: true, stakeholderAccess });
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_NOT_FOUND") {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    console.error("stakeholder_join_error", error);
    return NextResponse.json({ error: "Could not join Stakeholder Access" }, { status: 500 });
  }
}

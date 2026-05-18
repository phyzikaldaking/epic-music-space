import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireArtistByHandle } from "@/lib/emsRelationshipResolvers";

const db = prisma as typeof prisma & {
  artistInvestor?: {
    upsert: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

export async function POST(_: Request, { params }: { params: { handle: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db.artistInvestor) {
    return NextResponse.json({ error: "Investor relationships are not available until the EMS relationship schema is generated." }, { status: 503 });
  }

  try {
    const artist = await requireArtistByHandle(params.handle);

    if (artist.id === session.user.id) {
      return NextResponse.json({ error: "You cannot invest in yourself." }, { status: 400 });
    }

    const relationship = await db.artistInvestor.upsert({
      where: {
        artistId_userId: {
          artistId: artist.id,
          userId: session.user.id,
        },
      },
      update: {
        source: "artist_profile",
      },
      create: {
        artistId: artist.id,
        userId: session.user.id,
        source: "artist_profile",
      },
    });

    return NextResponse.json({ ok: true, relationship });
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_NOT_FOUND") {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    console.error("invest_in_artist_error", error);
    return NextResponse.json({ error: "Could not invest in artist" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { handle: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db.artistInvestor) {
    return NextResponse.json({ error: "Investor relationships are not available until the EMS relationship schema is generated." }, { status: 503 });
  }

  try {
    const artist = await requireArtistByHandle(params.handle);

    await db.artistInvestor.deleteMany({
      where: {
        artistId: artist.id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_NOT_FOUND") {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    console.error("remove_artist_investment_error", error);
    return NextResponse.json({ error: "Could not remove investment" }, { status: 500 });
  }
}

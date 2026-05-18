import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allyRequest = await prisma.allyConnection.findUnique({
      where: { id: params.id },
    });

    if (!allyRequest) {
      return NextResponse.json({ error: "Ally request not found" }, { status: 404 });
    }

    if (allyRequest.receiverId !== session.user.id) {
      return NextResponse.json({ error: "You can only accept Ally requests sent to you." }, { status: 403 });
    }

    const accepted = await prisma.allyConnection.update({
      where: { id: params.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, allyConnection: accepted });
  } catch (error) {
    console.error("ally_accept_error", error);
    return NextResponse.json({ error: "Could not accept Ally request" }, { status: 500 });
  }
}

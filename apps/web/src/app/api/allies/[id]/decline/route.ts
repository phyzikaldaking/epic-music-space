import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AllyConnectionRecord = {
  id: string;
  requesterId: string;
  receiverId: string;
  status: string;
};

const db = prisma as typeof prisma & {
  allyConnection?: {
    findUnique: (args: unknown) => Promise<AllyConnectionRecord | null>;
    update: (args: unknown) => Promise<unknown>;
  };
};

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db.allyConnection) {
    return NextResponse.json({ error: "Ally relationships are not available until the EMS relationship schema is generated." }, { status: 503 });
  }

  try {
    const allyRequest = await db.allyConnection.findUnique({
      where: { id: params.id },
    });

    if (!allyRequest) {
      return NextResponse.json({ error: "Ally request not found" }, { status: 404 });
    }

    if (allyRequest.receiverId !== session.user.id) {
      return NextResponse.json({ error: "You can only decline Ally requests sent to you." }, { status: 403 });
    }

    const declined = await db.allyConnection.update({
      where: { id: params.id },
      data: {
        status: "DECLINED",
      },
    });

    return NextResponse.json({ ok: true, allyConnection: declined });
  } catch (error) {
    console.error("ally_decline_error", error);
    return NextResponse.json({ error: "Could not decline Ally request" }, { status: 500 });
  }
}

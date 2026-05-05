import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listConnectedAccounts } from "@/lib/social";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await listConnectedAccounts(session.user.id);
  return NextResponse.json(accounts);
}

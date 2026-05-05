import { NextResponse } from "next/server";
import { listConnectedAccounts } from "@/lib/social";

export async function GET() {
  // TODO: use actual NextAuth server session to get userId.
  const demoUserId = process.env.DEMO_USER_ID;
  if (!demoUserId) return NextResponse.json([]);

  const accounts = await listConnectedAccounts(demoUserId);
  return NextResponse.json(accounts);
}

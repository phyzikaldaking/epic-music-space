import { NextResponse } from "next/server";
import qs from "querystring";
import { upsertConnectedAccount } from "@/lib/social";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  const code = url.searchParams.get("code");

  if (!provider || !code) return new NextResponse("Missing provider/code", { status: 400 });

  // Exchange code for token — provider-specific. For now, do minimal exchange
  // and store a placeholder. Integrate real token exchange per provider docs.
  // Twitter/X and Instagram require server-side token exchange with client secret.

  // NOTE: For production, validate `state` and handle errors.

  // Mock exchange: store providerAccountId = code substring for demo
  const providerAccountId = `id-${code.slice(0, 8)}`;

  // Require an authenticated user — NextAuth session is available server-side normally
  // Here we'll attempt to read a cookie 'next-auth.session-token' and map to user.
  // For now, this endpoint expects the user to be authenticated; if not, it will error.

  // TODO: wire into NextAuth server session retrieval. For now, show instructions.

  // Upsert a record for a placeholder userId - developer must replace with actual session user id
  const demoUserId = process.env.DEMO_USER_ID || null;
  if (!demoUserId) {
    return new NextResponse("Callback received — implement server-side exchange and user session mapping. Set DEMO_USER_ID to test.", { status: 200 });
  }

  await upsertConnectedAccount({
    userId: demoUserId,
    provider: provider as any,
    providerAccountId,
    accessToken: `token-${code}`,
    refreshToken: undefined,
    scope: undefined,
  });

  return new NextResponse("Connected — you can close this window.", { status: 200 });
}

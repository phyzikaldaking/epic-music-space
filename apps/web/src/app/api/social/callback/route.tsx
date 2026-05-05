import { NextResponse } from "next/server";
import { upsertConnectedAccount, type Provider } from "@/lib/social";

const SUPPORTED_PROVIDERS: readonly Provider[] = ["twitter", "instagram"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider");
  const code = url.searchParams.get("code");

  if (!providerParam || !code) {
    return new NextResponse("Missing provider/code", { status: 400 });
  }
  if (!SUPPORTED_PROVIDERS.includes(providerParam as Provider)) {
    return new NextResponse("Unsupported provider", { status: 400 });
  }
  const provider = providerParam as Provider;

  // Mock exchange: store providerAccountId = code substring for demo.
  // Real token exchange (validating `state`, swapping code → token via the
  // provider's OAuth endpoint) is per-provider work — this endpoint stays a
  // scaffold until that's wired up.
  const providerAccountId = `id-${code.slice(0, 8)}`;

  const demoUserId = process.env.DEMO_USER_ID || null;
  if (!demoUserId) {
    return new NextResponse(
      "Callback received — implement server-side exchange and user session mapping. Set DEMO_USER_ID to test.",
      { status: 200 },
    );
  }

  await upsertConnectedAccount({
    userId: demoUserId,
    provider,
    providerAccountId,
    accessToken: `token-${code}`,
  });

  return new NextResponse("Connected — you can close this window.", { status: 200 });
}

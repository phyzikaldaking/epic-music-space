import { NextRequest, NextResponse } from "next/server";
import { upsertConnectedAccount, type Provider } from "@/lib/social";
import { getSiteUrl } from "@/lib/site";
import {
  getSocialStateCookieName,
  verifySocialOAuthState,
} from "@/lib/socialOauthState";

const SUPPORTED_PROVIDERS: readonly Provider[] = ["twitter", "instagram"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!providerParam || !code || !state) {
    return new NextResponse("Missing provider/code", { status: 400 });
  }
  if (!SUPPORTED_PROVIDERS.includes(providerParam as Provider)) {
    return new NextResponse("Unsupported provider", { status: 400 });
  }
  const provider = providerParam as Provider;
  const stateCookie = req.cookies.get(getSocialStateCookieName())?.value ?? null;

  const verified = verifySocialOAuthState(state, provider);
  if (!verified || stateCookie !== state) {
    return new NextResponse("Invalid or expired OAuth state", { status: 400 });
  }

  // Mock exchange: store providerAccountId = code substring for demo.
  // Real token exchange (validating `state`, swapping code → token via the
  // provider's OAuth endpoint) is per-provider work — this endpoint stays a
  // scaffold until that's wired up.
  const providerAccountId = `id-${code.slice(0, 8)}`;

  await upsertConnectedAccount({
    userId: verified.userId,
    provider,
    providerAccountId,
    accessToken: `token-${code}`,
    meta: { needsRealOAuthExchange: true, linkedAt: new Date().toISOString() },
  });

  const response = NextResponse.redirect(new URL("/studio/settings?social=connected", getSiteUrl()));
  response.cookies.set(getSocialStateCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return response;
}

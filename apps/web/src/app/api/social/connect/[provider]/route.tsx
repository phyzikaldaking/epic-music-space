import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site";
import {
  buildSocialOAuthState,
  getSocialStateCookieName,
} from "@/lib/socialOauthState";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/signin?callbackUrl=/studio/settings", getSiteUrl()));
  }

  const { provider } = await params;
  if (provider !== "twitter" && provider !== "instagram") {
    return new NextResponse("Unknown provider", { status: 400 });
  }
  const { state, maxAgeSeconds } = buildSocialOAuthState(session.user.id, provider);
  const stateCookie = getSocialStateCookieName();
  const base = getSiteUrl();

  if (provider === "twitter") {
    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) return new NextResponse("Twitter OAuth is not configured", { status: 503 });
    const redirectUri = `${base}/api/social/callback?provider=twitter`;
    const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=${encodeURIComponent(state)}`;
    const response = NextResponse.redirect(url);
    response.cookies.set(stateCookie, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: maxAgeSeconds,
      path: "/",
    });
    return response;
  }

  if (provider === "instagram") {
    const clientId = process.env.IG_CLIENT_ID || process.env.IG_APP_ID;
    if (!clientId) return new NextResponse("Instagram OAuth is not configured", { status: 503 });
    const redirectUri = `${base}/api/social/callback?provider=instagram`;
    const url = `https://api.instagram.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user_profile,user_media&response_type=code&state=${encodeURIComponent(state)}`;
    const response = NextResponse.redirect(url);
    response.cookies.set(stateCookie, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: maxAgeSeconds,
      path: "/",
    });
    return response;
  }
  return new NextResponse("Unknown provider", { status: 400 });
}

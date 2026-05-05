import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  if (provider === "twitter") {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/social/callback?provider=twitter`;
    const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId || "")}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=state`;
    return NextResponse.redirect(url);
  }

  if (provider === "instagram") {
    const clientId = process.env.IG_CLIENT_ID || process.env.IG_APP_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/social/callback?provider=instagram`;
    const url = `https://api.instagram.com/oauth/authorize?client_id=${encodeURIComponent(clientId || "")}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user_profile,user_media&response_type=code`;
    return NextResponse.redirect(url);
  }

  return new NextResponse("Unknown provider", { status: 400 });
}

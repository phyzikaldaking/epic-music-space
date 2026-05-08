import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function makeRequest(path: string) {
  return new NextRequest(`https://epicmusicspace.com${path}`);
}

describe("auth middleware", () => {
  it("redirects anonymous protected pages to sign-in with a callback", () => {
    const res = middleware(makeRequest("/dashboard"));
    const location = res.headers.get("location");

    expect(res.status).toBe(307);
    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe("/auth/signin");
    // The middleware preserves the full incoming URL as the callback so
    // sign-in can redirect back to exactly where the user was headed.
    expect(new URL(location!).searchParams.get("callbackUrl")).toBe(
      "https://epicmusicspace.com/dashboard",
    );
  });

  it("does not send metadata assets through the auth wall", () => {
    for (const path of [
      "/icon?size=192",
      "/manifest.webmanifest",
      "/opengraph-image",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      const res = middleware(makeRequest(path));

      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("content-security-policy")).toBeNull();
    }
  });

  it("keeps Stripe Connect API routes protected", () => {
    const res = middleware(makeRequest("/api/stripe-connect/account"));

    expect(res.status).toBe(401);
  });
});

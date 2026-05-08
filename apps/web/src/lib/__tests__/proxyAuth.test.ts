import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function makeRequest(path: string) {
  return new NextRequest(`https://epicmusicspace.com${path}`);
}

describe("auth proxy", () => {
  it("redirects anonymous protected pages to sign-in with a callback", async () => {
    const res = await proxy(makeRequest("/dashboard"));
    const location = res.headers.get("location");

    expect(res.status).toBe(307);
    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe("/auth/signin");
    expect(new URL(location!).searchParams.get("callbackUrl")).toBe("/dashboard");
  });

  it("does not send metadata assets through the auth wall", async () => {
    for (const path of [
      "/icon?size=192",
      "/manifest.webmanifest",
      "/opengraph-image",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      const res = await proxy(makeRequest(path));

      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("content-security-policy")).toBeNull();
    }
  });

  it("keeps Stripe Connect API routes protected", async () => {
    const res = await proxy(makeRequest("/api/stripe-connect/account"));

    expect(res.status).toBe(401);
  });
});

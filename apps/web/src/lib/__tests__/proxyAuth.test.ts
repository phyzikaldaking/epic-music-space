import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy as middleware } from "@/proxy";

function makeRequest(path: string, opts: { authed?: boolean } = {}) {
  const req = new NextRequest(`https://epicmusicspace.com${path}`);
  if (opts.authed) {
    req.cookies.set("__Secure-authjs.session-token", "fake-cookie");
  }
  return req;
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

  it("allows camera and microphone on HTML pages for LiveKit sessions", () => {
    const res = middleware(makeRequest("/rooms"));
    const policy = res.headers.get("permissions-policy") ?? "";

    expect(policy).toContain("camera=(self)");
    expect(policy).toContain("microphone=(self)");
  });

  it("bounces already-authed visitors off /auth/signin to a safe absolute URL", () => {
    // A relative callbackUrl like "/ai" used to flow straight into
    // NextResponse.redirect, which calls `new URL(dest)` and threw "URL
    // is malformed" → 500. The redirect must always resolve to an
    // absolute URL on the same origin.
    const res = middleware(
      makeRequest("/auth/signin?callbackUrl=/ai", { authed: true }),
    );
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("https://epicmusicspace.com/ai");
  });

  it("blocks open-redirect callbackUrls on /auth/signin", () => {
    const res = middleware(
      makeRequest("/auth/signin?callbackUrl=//evil.com/x", { authed: true }),
    );
    expect(res.status).toBe(307);
    // Must NOT honor the protocol-relative URL — fall back to AUTHED_HOME.
    const location = res.headers.get("location");
    expect(location).toBe("https://epicmusicspace.com/feed");
  });
});

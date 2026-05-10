import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/csp";

describe("buildContentSecurityPolicy", () => {
  it("uses script nonces and removes unsafe script allowances in production", () => {
    const csp = buildContentSecurityPolicy("nonce123", "production");
    const scriptDirective = csp.split("; ").find((part) => part.startsWith("script-src")) ?? "";

    // 'strict-dynamic' lets nonced root scripts authorize the inline flight
    // payloads Next.js injects. The nonce is the trust root; modern browsers
    // ignore the host allowlist in its presence, but legacy browsers fall back
    // to it (so 'self' + Stripe still listed for them).
    expect(scriptDirective).toBe(
      "script-src 'self' 'nonce-nonce123' 'strict-dynamic' https://js.stripe.com",
    );
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
  });

  it("keeps unsafe-eval only for development tooling", () => {
    const csp = buildContentSecurityPolicy("nonce123", "development");

    expect(csp).toContain("'unsafe-eval'");
  });

  it("allows Supabase realtime websocket connections", () => {
    const csp = buildContentSecurityPolicy("nonce123", "production");
    const connectDirective = csp.split("; ").find((part) => part.startsWith("connect-src")) ?? "";

    expect(connectDirective).toContain("https://*.supabase.co");
    expect(connectDirective).toContain("wss://*.supabase.co");
  });

  it("allows LiveKit Cloud websocket connections for rooms and studio sessions", () => {
    const csp = buildContentSecurityPolicy("nonce123", "production");
    const connectDirective = csp.split("; ").find((part) => part.startsWith("connect-src")) ?? "";

    expect(connectDirective).toContain("https://*.livekit.cloud");
    expect(connectDirective).toContain("wss://*.livekit.cloud");
  });
});

import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/csp";

describe("buildContentSecurityPolicy", () => {
  it("uses script nonces and removes unsafe script allowances in production", () => {
    const csp = buildContentSecurityPolicy("nonce123", "production");
    const scriptDirective = csp.split("; ").find((part) => part.startsWith("script-src")) ?? "";

    expect(scriptDirective).toBe("script-src 'self' 'nonce-nonce123' https://js.stripe.com");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
  });

  it("keeps unsafe-eval only for development tooling", () => {
    const csp = buildContentSecurityPolicy("nonce123", "development");

    expect(csp).toContain("'unsafe-eval'");
  });
});

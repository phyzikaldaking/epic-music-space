import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildSocialOAuthState,
  verifySocialOAuthState,
} from "@/lib/socialOauthState";

describe("socialOauthState", () => {
  it("accepts a valid state for the matching provider", () => {
    const { state } = buildSocialOAuthState("user_123", "twitter");
    const payload = verifySocialOAuthState(state, "twitter");
    expect(payload?.userId).toBe("user_123");
    expect(payload?.provider).toBe("twitter");
  });

  it("rejects tampered state", () => {
    const { state } = buildSocialOAuthState("user_123", "twitter");
    const tampered = `${state}x`;
    expect(verifySocialOAuthState(tampered, "twitter")).toBeNull();
  });

  it("rejects valid state for the wrong provider", () => {
    const { state } = buildSocialOAuthState("user_123", "twitter");
    expect(verifySocialOAuthState(state, "instagram")).toBeNull();
  });

  it("rejects expired state", () => {
    const payload = Buffer.from(
      JSON.stringify({
        userId: "user_123",
        provider: "twitter",
        nonce: "abc",
        exp: Date.now() - 1_000,
      }),
      "utf8",
    ).toString("base64url");
    const secret =
      process.env.SOCIAL_OAUTH_STATE_SECRET ||
      process.env.AUTH_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      "dev-social-state-secret";
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    expect(verifySocialOAuthState(`${payload}.${sig}`, "twitter")).toBeNull();
  });
});

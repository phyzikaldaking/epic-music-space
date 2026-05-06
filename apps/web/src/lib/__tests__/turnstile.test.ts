import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/turnstile";

const ORIGINAL_ENV = process.env.TURNSTILE_SECRET_KEY;

describe("verifyTurnstileToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = ORIGINAL_ENV;
  });

  it("skips verification when TURNSTILE_SECRET_KEY is not set", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await verifyTurnstileToken("any-token");
    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects when the secret is set but no token is provided", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const result = await verifyTurnstileToken(undefined);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("Missing Turnstile"),
    });
  });

  it("returns ok when Cloudflare reports success", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const result = await verifyTurnstileToken("good-token", "1.2.3.4");
    expect(result).toEqual({ ok: true });
  });

  it("rejects with the error codes when Cloudflare reports failure", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
        { status: 200 },
      ),
    );
    const result = await verifyTurnstileToken("bad-token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid-input-response");
    }
  });

  it("fails open when the verifier itself errors (CF outage)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ETIMEDOUT"));
    const result = await verifyTurnstileToken("any-token");
    expect(result).toEqual({ ok: true });
  });
});

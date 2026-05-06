import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSocialEncryptionConfigured, encryptToken, decryptToken } from "@/lib/crypto";

const TEST_KEY = "super-secret-test-key-32-chars-ok";

// ---------------------------------------------------------------------------
// isSocialEncryptionConfigured
// ---------------------------------------------------------------------------

describe("isSocialEncryptionConfigured", () => {
  const original = process.env.SOCIAL_ENCRYPTION_KEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SOCIAL_ENCRYPTION_KEY;
    } else {
      process.env.SOCIAL_ENCRYPTION_KEY = original;
    }
  });

  it("returns false when SOCIAL_ENCRYPTION_KEY is not set", () => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
    expect(isSocialEncryptionConfigured()).toBe(false);
  });

  it("returns false when SOCIAL_ENCRYPTION_KEY is an empty string", () => {
    process.env.SOCIAL_ENCRYPTION_KEY = "";
    expect(isSocialEncryptionConfigured()).toBe(false);
  });

  it("returns true when SOCIAL_ENCRYPTION_KEY is set to a non-empty string", () => {
    process.env.SOCIAL_ENCRYPTION_KEY = TEST_KEY;
    expect(isSocialEncryptionConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// encryptToken / decryptToken — round-trip with key
// ---------------------------------------------------------------------------

describe("encryptToken + decryptToken — round-trip", () => {
  beforeEach(() => {
    process.env.SOCIAL_ENCRYPTION_KEY = TEST_KEY;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
    delete process.env.VERCEL_ENV;
  });

  it("decrypts an encrypted token back to the original plaintext", () => {
    const plaintext = "github_access_token_abc123";
    const ciphertext = encryptToken(plaintext);
    expect(decryptToken(ciphertext)).toBe(plaintext);
  });

  it("produces ciphertext that is not equal to the plaintext", () => {
    const plaintext = "my_secret_token";
    const ciphertext = encryptToken(plaintext);
    expect(ciphertext).not.toBe(plaintext);
  });

  it("produces valid base64-encoded ciphertext", () => {
    const ciphertext = encryptToken("some_token");
    // base64 characters only
    expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const plaintext = "same_plaintext";
    const ct1 = encryptToken(plaintext);
    const ct2 = encryptToken(plaintext);
    // Due to random IV the ciphertexts should differ
    expect(ct1).not.toBe(ct2);
    // But both should decrypt correctly
    expect(decryptToken(ct1)).toBe(plaintext);
    expect(decryptToken(ct2)).toBe(plaintext);
  });

  it("handles an empty string plaintext", () => {
    const plaintext = "";
    const ciphertext = encryptToken(plaintext);
    expect(decryptToken(ciphertext)).toBe(plaintext);
  });

  it("handles long tokens (e.g. JWT-like strings)", () => {
    const longToken =
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ." +
      "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(decryptToken(encryptToken(longToken))).toBe(longToken);
  });

  it("handles special characters in tokens", () => {
    const special = "token!@#$%^&*()_+-=[]{}|;':\",./<>?";
    expect(decryptToken(encryptToken(special))).toBe(special);
  });

  it("handles Unicode characters", () => {
    const unicode = "тōkèñ_ñøøñ_🎵";
    expect(decryptToken(encryptToken(unicode))).toBe(unicode);
  });
});

// ---------------------------------------------------------------------------
// encryptToken — no key (non-Vercel env) → returns plaintext
// ---------------------------------------------------------------------------

describe("encryptToken — no SOCIAL_ENCRYPTION_KEY in non-Vercel env", () => {
  beforeEach(() => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
    delete process.env.VERCEL_ENV;
  });

  it("returns the plaintext as-is when key is absent (dev-mode fallback)", () => {
    const plaintext = "some_token";
    // In non-Vercel environments the module logs a warning and stores plaintext
    expect(encryptToken(plaintext)).toBe(plaintext);
  });
});

// ---------------------------------------------------------------------------
// encryptToken — Vercel production without key → throws
// ---------------------------------------------------------------------------

describe("encryptToken — VERCEL_ENV=production without key", () => {
  beforeEach(() => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
    process.env.VERCEL_ENV = "production";
  });

  afterEach(() => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
    delete process.env.VERCEL_ENV;
  });

  it("throws when trying to encrypt on a Vercel prod deployment without a key", () => {
    expect(() => encryptToken("token")).toThrow(/SOCIAL_ENCRYPTION_KEY/);
  });
});

// ---------------------------------------------------------------------------
// decryptToken — no key → returns payload as-is
// ---------------------------------------------------------------------------

describe("decryptToken — no SOCIAL_ENCRYPTION_KEY", () => {
  beforeEach(() => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
  });

  it("returns the payload unchanged when no key is configured", () => {
    expect(decryptToken("any_payload")).toBe("any_payload");
  });
});

// ---------------------------------------------------------------------------
// decryptToken — tampered ciphertext → falls back to payload
// ---------------------------------------------------------------------------

describe("decryptToken — tampered / invalid ciphertext", () => {
  beforeEach(() => {
    process.env.SOCIAL_ENCRYPTION_KEY = TEST_KEY;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    delete process.env.SOCIAL_ENCRYPTION_KEY;
  });

  it("returns the original payload (not throwing) when the ciphertext is invalid base64 payload", () => {
    // A valid base64 string that is too short to be a real ciphertext
    const bogus = Buffer.from("not-a-valid-ciphertext-at-all").toString("base64");
    const result = decryptToken(bogus);
    // Should not throw; returns the bogus payload unchanged
    expect(result).toBe(bogus);
  });

  it("returns the original payload when auth tag verification fails (tampered bytes)", () => {
    const plaintext = "original_token";
    const ciphertext = encryptToken(plaintext);
    // Flip one byte in the middle of the base64-decoded payload
    const buf = Buffer.from(ciphertext, "base64");
    buf[20] ^= 0xff; // corrupt auth tag / encrypted data
    const tampered = buf.toString("base64");
    const result = decryptToken(tampered);
    expect(result).toBe(tampered); // gracefully returns the tampered payload
  });
});

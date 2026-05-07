import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyReplicateSignature } from "@/lib/stemSeparation";

const SECRET = "test-replicate-secret";

function sign(body: string, ts = "1700000000") {
  const expected = createHmac("sha256", SECRET)
    .update(`${ts}.${body}`)
    .digest("hex");
  return `t=${ts},v1=${expected}`;
}

describe("verifyReplicateSignature", () => {
  it("accepts a properly signed payload", () => {
    const body = JSON.stringify({ id: "abc", status: "succeeded" });
    expect(verifyReplicateSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects when the body has been tampered with", () => {
    const body = JSON.stringify({ id: "abc", status: "succeeded" });
    const goodSig = sign(body);
    const tamperedBody = JSON.stringify({ id: "abc", status: "failed" });
    expect(verifyReplicateSignature(tamperedBody, goodSig, SECRET)).toBe(false);
  });

  it("rejects when the secret is missing", () => {
    const body = JSON.stringify({ id: "abc" });
    expect(verifyReplicateSignature(body, sign(body), undefined)).toBe(false);
  });

  it("rejects when the header is missing or malformed", () => {
    const body = JSON.stringify({ id: "abc" });
    expect(verifyReplicateSignature(body, null, SECRET)).toBe(false);
    expect(verifyReplicateSignature(body, "not-a-signature", SECRET)).toBe(false);
    expect(verifyReplicateSignature(body, "t=123", SECRET)).toBe(false);
  });
});

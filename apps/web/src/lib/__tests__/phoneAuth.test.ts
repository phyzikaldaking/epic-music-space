import { describe, expect, it } from "vitest";
import {
  hashPhoneLoginCode,
  normalizePhone,
  phoneLoginIdentifier,
} from "@/lib/phoneAuth";

describe("phoneAuth", () => {
  it("normalizes valid E.164 numbers", () => {
    expect(normalizePhone(" +1 (555) 123-4567 ")).toBe("+15551234567");
    expect(normalizePhone("0044 7700 900123")).toBe("+447700900123");
  });

  it("rejects invalid phone formats", () => {
    expect(normalizePhone("5551234567")).toBeNull();
    expect(normalizePhone("+")).toBeNull();
  });

  it("creates stable login identifiers", () => {
    expect(phoneLoginIdentifier("+15551234567")).toBe("phone-login:+15551234567");
  });

  it("hashes login codes deterministically per phone", () => {
    const a = hashPhoneLoginCode("123456", "+15551234567");
    const b = hashPhoneLoginCode("123456", "+15551234567");
    const c = hashPhoneLoginCode("123456", "+15557654321");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

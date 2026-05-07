import { describe, expect, it } from "vitest";
import { shouldUseExpertUploadMode } from "@/lib/studioNewMode";

describe("shouldUseExpertUploadMode", () => {
  it("returns true only when expert query param is exactly 1", () => {
    expect(shouldUseExpertUploadMode("1")).toBe(true);
    expect(shouldUseExpertUploadMode("0")).toBe(false);
    expect(shouldUseExpertUploadMode("true")).toBe(false);
    expect(shouldUseExpertUploadMode(undefined)).toBe(false);
  });
});

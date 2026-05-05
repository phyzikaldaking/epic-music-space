import { describe, expect, it } from "vitest";

import { maskProfanity } from "@/lib/profanity";

describe("maskProfanity", () => {
  it("returns flagged=false when no matches", () => {
    const result = maskProfanity("hello world");
    expect(result).toEqual({ masked: "hello world", flagged: false });
  });

  it("masks whole-word matches case-insensitively", () => {
    const result = maskProfanity("This is SHIT.");
    expect(result.flagged).toBe(true);
    expect(result.masked).toBe("This is S***.");
  });

  it("does not match inside other words", () => {
    const result = maskProfanity("class assignment is fine");
    expect(result.flagged).toBe(false);
    expect(result.masked).toBe("class assignment is fine");
  });

  it("masks multiple occurrences", () => {
    const result = maskProfanity("fuck that shit");
    expect(result.flagged).toBe(true);
    expect(result.masked).toBe("f*** that s***");
  });
});


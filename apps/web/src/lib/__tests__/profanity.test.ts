import { describe, expect, it } from "vitest";
import { maskProfanity } from "@/lib/profanity";

describe("maskProfanity", () => {
  it("returns the input unchanged when no terms match", () => {
    const { masked, flagged } = maskProfanity("hello world");
    expect(masked).toBe("hello world");
    expect(flagged).toBe(false);
  });

  it("masks a flagged term while keeping the message readable", () => {
    const { masked, flagged } = maskProfanity("this is shit");
    expect(masked).toBe("this is s***");
    expect(flagged).toBe(true);
  });

  it("masks multiple flagged terms in one message", () => {
    const { masked } = maskProfanity("fuck this shit");
    expect(masked).toBe("f*** this s***");
  });

  it("is case-insensitive", () => {
    const { masked, flagged } = maskProfanity("SHIT happens");
    expect(flagged).toBe(true);
    expect(masked.startsWith("S")).toBe(true);
    expect(masked).toContain("***");
  });

  it("keeps benign words containing flagged substrings intact", () => {
    // \b boundaries protect "passing", "classic", "shitake" should stay clean.
    const { masked, flagged } = maskProfanity("classic shitake mushrooms");
    expect(flagged).toBe(false);
    expect(masked).toBe("classic shitake mushrooms");
  });

  it("preserves message length so UI layout is stable", () => {
    const input = "fuck off";
    const { masked } = maskProfanity(input);
    expect(masked.length).toBe(input.length);
  });
});

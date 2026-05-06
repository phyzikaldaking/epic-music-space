import { describe, it, expect } from "vitest";
import {
  evaluatePassword,
  personalTokensFor,
  MIN_LENGTH,
  MAX_LENGTH,
} from "@/lib/passwordStrength";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("passwordStrength constants", () => {
  it("MIN_LENGTH is 8", () => {
    expect(MIN_LENGTH).toBe(8);
  });

  it("MAX_LENGTH is 128", () => {
    expect(MAX_LENGTH).toBe(128);
  });
});

// ---------------------------------------------------------------------------
// evaluatePassword — empty
// ---------------------------------------------------------------------------

describe("evaluatePassword — empty password", () => {
  it("returns score 0 and label Empty", () => {
    const result = evaluatePassword("");
    expect(result.score).toBe(0);
    expect(result.label).toBe("Empty");
    expect(result.acceptable).toBe(false);
  });

  it("provides a hint prompting the user to choose a password", () => {
    const { hint } = evaluatePassword("");
    expect(hint).toBeTruthy();
  });

  it("returns all requirements as unmet when the password is empty", () => {
    const { requirements } = evaluatePassword("");
    const metCount = requirements.filter((r) => r.met).length;
    expect(metCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// evaluatePassword — too short
// ---------------------------------------------------------------------------

describe("evaluatePassword — too short (< 8 chars)", () => {
  it("returns score 1 and label Too short for a 7-character password", () => {
    const result = evaluatePassword("Abc1234");
    expect(result.score).toBe(1);
    expect(result.label).toBe("Too short");
    expect(result.acceptable).toBe(false);
  });

  it("hint tells the user how many characters to add", () => {
    const result = evaluatePassword("Abc12"); // 5 chars, need 3 more
    expect(result.hint).toMatch(/3 more character/);
  });

  it("hint uses singular 'character' when one more character is needed", () => {
    const result = evaluatePassword("Abcdefg"); // 7 chars, need 1 more
    expect(result.hint).toMatch(/1 more character[^s]/);
  });

  it("length requirement is marked as unmet", () => {
    const { requirements } = evaluatePassword("abc123");
    const lengthReq = requirements.find((r) => r.id === "length");
    expect(lengthReq?.met).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluatePassword — blocked passwords
// ---------------------------------------------------------------------------

describe("evaluatePassword — blocked (common) passwords", () => {
  const blocked = [
    "password",
    "password123",
    "12345678",
    "qwerty123",
    "iloveyou",
    "admin123",
    "passw0rd",
    "p@ssw0rd",
    "epicmusic",
    "epicmusicspace",
  ];

  for (const pw of blocked) {
    it(`blocks '${pw}'`, () => {
      const result = evaluatePassword(pw);
      expect(result.score).toBe(1);
      expect(result.label).toBe("Weak");
      expect(result.acceptable).toBe(false);
    });
  }

  it("blocking is case-insensitive", () => {
    const result = evaluatePassword("PASSWORD");
    expect(result.label).toBe("Weak");
    expect(result.acceptable).toBe(false);
  });

  it("marks the notCommon requirement as unmet for blocked passwords", () => {
    const { requirements } = evaluatePassword("password");
    const notCommon = requirements.find((r) => r.id === "notCommon");
    expect(notCommon?.met).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluatePassword — score bands (length-first, NIST-aligned)
// ---------------------------------------------------------------------------

describe("evaluatePassword — score bands", () => {
  it("length 8-9 with 1 character class is Weak (score 1)", () => {
    const result = evaluatePassword("aaaaaaaa"); // 8, only lower
    expect(result.score).toBe(1);
    expect(result.label).toBe("Weak");
    expect(result.acceptable).toBe(false);
  });

  it("length 8-9 with 2+ character classes is OK (score 2)", () => {
    const result = evaluatePassword("aaaaaaa1"); // 8, lower+digit
    expect(result.score).toBe(2);
    expect(result.label).toBe("OK");
    expect(result.acceptable).toBe(true);
  });

  it("length 10-11 with 1 class is Weak", () => {
    const result = evaluatePassword("aaaaaaaaaa"); // 10, only lower
    expect(result.score).toBe(1);
    expect(result.label).toBe("Weak");
  });

  it("length 10-11 with 2+ classes is OK (score 2)", () => {
    const result = evaluatePassword("aaaaaaaaA1"); // 10, lower+upper+digit
    expect(result.score).toBe(2);
  });

  it("length 12-15 with 1 class is OK (score 2)", () => {
    const result = evaluatePassword("aaaaaaaaaaaa"); // 12, only lower
    expect(result.score).toBe(2);
  });

  it("length 12-15 with 2+ classes is Good (score 3)", () => {
    const result = evaluatePassword("aaaaaaaaaaA1"); // 12, lower+upper+digit
    expect(result.score).toBe(3);
    expect(result.label).toBe("Good");
  });

  it("length 16-19 with 1 class is Good (score 3)", () => {
    const result = evaluatePassword("aaaaaaaaaaaaaaaa"); // 16, only lower
    expect(result.score).toBe(3);
  });

  it("length 16-19 with 2+ classes is Strong (score 4)", () => {
    const result = evaluatePassword("aaaaaaaaaaaaaaaA"); // 16, lower+upper
    expect(result.score).toBe(4);
    expect(result.label).toBe("Strong");
  });

  it("length 20+ is always Strong regardless of character classes", () => {
    const result = evaluatePassword("aaaaaaaaaaaaaaaaaaaa"); // 20, only lower
    expect(result.score).toBe(4);
    expect(result.label).toBe("Strong");
    expect(result.acceptable).toBe(true);
  });

  it("acceptable is true for score >= 2", () => {
    expect(evaluatePassword("aaaaaaa1").acceptable).toBe(true); // score 2
    expect(evaluatePassword("aaaaaaaaaaA1").acceptable).toBe(true); // score 3
    expect(evaluatePassword("aaaaaaaaaaaaaaaA").acceptable).toBe(true); // score 4
  });
});

// ---------------------------------------------------------------------------
// evaluatePassword — personal token matching
// ---------------------------------------------------------------------------

describe("evaluatePassword — personal token penalty", () => {
  it("drops score by 1 when password contains a personal token (>= 5 chars)", () => {
    // 16+ chars with 2 classes would normally be Strong (4), but personal hit → Good (3)
    const result = evaluatePassword("Johndoe_password_long!", ["johndoe"]);
    expect(result.score).toBeLessThan(4);
    expect(result.acceptable).toBe(true); // still acceptable
  });

  it("flags notPersonal requirement as unmet when personal token matched", () => {
    const { requirements } = evaluatePassword("MyNameIsAlice1!", ["alice"]);
    const notPersonal = requirements.find((r) => r.id === "notPersonal");
    expect(notPersonal?.met).toBe(false);
  });

  it("does not flag short tokens (< 5 chars) as personal matches", () => {
    // "Joe" is only 3 chars — should not trigger a penalty
    const result = evaluatePassword("JoeJoeJoe1", ["Joe"]);
    const notPersonal = result.requirements.find((r) => r.id === "notPersonal");
    expect(notPersonal?.met).toBe(true);
  });

  it("matching is case-insensitive for personal tokens", () => {
    const result = evaluatePassword("ALICE_secure_pass1!", ["alice"]);
    const notPersonal = result.requirements.find((r) => r.id === "notPersonal");
    expect(notPersonal?.met).toBe(false);
  });

  it("personal-hit hint mentions name or email", () => {
    const { hint } = evaluatePassword("alicealice1!", ["alice"]);
    expect(hint).toMatch(/name|email/i);
  });

  it("floors score at 1 after personal-hit penalty (never 0)", () => {
    // Score would be 1 already for 8-9 chars, single class → stays at 1 after penalty
    const result = evaluatePassword("aaaaalice", ["alice"]); // 9 chars, lower only, personal hit
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it("returns empty hint when password is Strong and no personal hit", () => {
    const result = evaluatePassword("aaaaaaaaaaaaaaaaaaa1"); // 20 chars, 2 classes
    expect(result.hint).toBe("");
  });
});

// ---------------------------------------------------------------------------
// evaluatePassword — requirements list shape
// ---------------------------------------------------------------------------

describe("evaluatePassword — requirements list", () => {
  it("always returns exactly 5 requirements", () => {
    const { requirements } = evaluatePassword("TestPass1");
    expect(requirements).toHaveLength(5);
  });

  it("includes the expected requirement IDs", () => {
    const { requirements } = evaluatePassword("TestPass1");
    const ids = requirements.map((r) => r.id);
    expect(ids).toContain("length");
    expect(ids).toContain("letter");
    expect(ids).toContain("digit");
    expect(ids).toContain("notCommon");
    expect(ids).toContain("notPersonal");
  });

  it("marks length as met when password is long enough", () => {
    const { requirements } = evaluatePassword("Abcdefg1"); // 8 chars
    const lengthReq = requirements.find((r) => r.id === "length");
    expect(lengthReq?.met).toBe(true);
  });

  it("marks letter as met when the password has at least one letter", () => {
    const { requirements } = evaluatePassword("aaaaaaaa"); // all letters
    const letterReq = requirements.find((r) => r.id === "letter");
    expect(letterReq?.met).toBe(true);
  });

  it("marks digit as met when the password has at least one digit", () => {
    const { requirements } = evaluatePassword("aaaaaaa1");
    const digitReq = requirements.find((r) => r.id === "digit");
    expect(digitReq?.met).toBe(true);
  });

  it("each requirement has an id, label, and met field", () => {
    const { requirements } = evaluatePassword("TestPass1");
    for (const req of requirements) {
      expect(req).toHaveProperty("id");
      expect(req).toHaveProperty("label");
      expect(typeof req.met).toBe("boolean");
    }
  });
});

// ---------------------------------------------------------------------------
// personalTokensFor
// ---------------------------------------------------------------------------

describe("personalTokensFor", () => {
  it("splits a multi-word name into individual pieces", () => {
    const tokens = personalTokensFor({ name: "John Smith", email: null });
    expect(tokens).toContain("John");
    expect(tokens).toContain("Smith");
  });

  it("extracts the local part of an email", () => {
    const tokens = personalTokensFor({ name: null, email: "alice@example.com" });
    expect(tokens).toContain("alice");
  });

  it("combines both name tokens and email local-part", () => {
    const tokens = personalTokensFor({ name: "Alice Wonderland", email: "awonder@example.com" });
    expect(tokens).toContain("Alice");
    expect(tokens).toContain("Wonderland");
    expect(tokens).toContain("awonder");
  });

  it("omits name pieces shorter than 3 characters", () => {
    const tokens = personalTokensFor({ name: "Jo Li Smith", email: null });
    // "Jo" and "Li" are < 3 chars
    expect(tokens).not.toContain("Jo");
    expect(tokens).not.toContain("Li");
    expect(tokens).toContain("Smith");
  });

  it("returns an empty array when both name and email are null", () => {
    expect(personalTokensFor({ name: null, email: null })).toEqual([]);
  });

  it("returns an empty array when both name and email are undefined", () => {
    expect(personalTokensFor({})).toEqual([]);
  });

  it("handles extra whitespace in name gracefully", () => {
    const tokens = personalTokensFor({ name: "  Alice   Smith  ", email: null });
    expect(tokens).toContain("Alice");
    expect(tokens).toContain("Smith");
  });

  it("does not include an email local-part shorter than 3 characters", () => {
    const tokens = personalTokensFor({ name: null, email: "ab@example.com" });
    expect(tokens).not.toContain("ab");
  });
});

// Shared password strength + validation. Both the signup form and the
// /api/auth/register route call into this so the rules can't drift.
//
// References:
// - NIST SP 800-63B § 5.1.1.2: prefer length over complexity, allow
//   long passphrases, screen against a short blocklist of common passwords,
//   don't force periodic rotation.
// - GitHub / Stripe / Apple: live requirements checklist + colour-coded
//   strength meter, 8 char minimum, common-password block.

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

// A tiny blocklist of passwords that show up in every breach corpus.
// The full HIBP list is too big to ship to the browser, but this catches
// the embarrassingly bad inputs without any deps. Server-side, we still
// rely on bcrypt + rate limits as the real defence.
const BLOCKED_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "letmein1",
  "admin123",
  "welcome1",
  "monkey123",
  "abc12345",
  "111111111",
  "passw0rd",
  "p@ssw0rd",
  "epicmusic",
  "epicmusicspace",
]);

export type PasswordRequirement = {
  id: "length" | "letter" | "digit" | "notCommon" | "notPersonal";
  label: string;
  met: boolean;
};

export type PasswordStrength = {
  /** 0 (empty) · 1 (weak) · 2 (ok) · 3 (good) · 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4;
  label: "Empty" | "Too short" | "Weak" | "OK" | "Good" | "Strong";
  /** Hint shown next to the meter — what to do next. Empty when strong. */
  hint: string;
  requirements: PasswordRequirement[];
  /** True when the password is strong enough for the API to accept it. */
  acceptable: boolean;
};

/**
 * Returns a static, deterministic score + requirements list. Pure: safe to
 * call on every keystroke and on the server in the same request.
 *
 * `personalTokens` is the list of things the password must NOT contain
 * (typically the user's email local-part, name fragments). Comparison is
 * case-insensitive and substring-based, so "music" in name → password
 * "MusicLover123" gets flagged.
 */
export function evaluatePassword(
  password: string,
  personalTokens: string[] = [],
): PasswordStrength {
  const len = password.length;

  if (len === 0) {
    return {
      score: 0,
      label: "Empty",
      hint: "Choose a password.",
      requirements: baseRequirements(password, personalTokens),
      acceptable: false,
    };
  }

  if (len < MIN_LENGTH) {
    return {
      score: 1,
      label: "Too short",
      hint: `Add ${MIN_LENGTH - len} more character${MIN_LENGTH - len === 1 ? "" : "s"}.`,
      requirements: baseRequirements(password, personalTokens),
      acceptable: false,
    };
  }

  const lower = password.toLowerCase();
  const requirements = baseRequirements(password, personalTokens);

  if (BLOCKED_PASSWORDS.has(lower)) {
    return {
      score: 1,
      label: "Weak",
      hint: "That password shows up in every leaked-password list. Pick something only you would think of.",
      requirements: requirements.map((r) =>
        r.id === "notCommon" ? { ...r, met: false } : r,
      ),
      acceptable: false,
    };
  }

  // Variety classes — count once each.
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  // Penalise passwords that contain personal info — common mistake.
  const personalHit = personalTokens.some(
    (t) => t.length >= 3 && lower.includes(t.toLowerCase()),
  );
  if (personalHit) {
    return {
      score: 1,
      label: "Weak",
      hint: "Don't include your name or email in the password.",
      requirements: requirements.map((r) =>
        r.id === "notPersonal" ? { ...r, met: false } : r,
      ),
      acceptable: false,
    };
  }

  // Score bands — length-first per NIST guidance, with a small bump for
  // character-class variety.
  let score: 0 | 1 | 2 | 3 | 4;
  if (len >= 16 && classes >= 2) score = 4;
  else if (len >= 12 && classes >= 2) score = 3;
  else if (len >= 10 && classes >= 2) score = 3;
  else if (len >= 8 && classes >= 2) score = 2;
  else if (len >= 12) score = 2; // long but single-class — still passable
  else score = 1;

  const label =
    score === 4 ? "Strong" : score === 3 ? "Good" : score === 2 ? "OK" : "Weak";

  const hint =
    score >= 3
      ? ""
      : classes < 2
        ? "Mix in letters and numbers (or a symbol) to harden it."
        : len < 12
          ? "Make it a few characters longer for extra strength."
          : "Add a number or symbol to harden it.";

  return {
    score,
    label,
    hint,
    requirements,
    acceptable: score >= 2,
  };
}

function baseRequirements(
  password: string,
  personalTokens: string[],
): PasswordRequirement[] {
  const lower = password.toLowerCase();
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const personalHit = personalTokens.some(
    (t) => t.length >= 3 && lower.includes(t.toLowerCase()),
  );
  return [
    {
      id: "length",
      label: `${MIN_LENGTH}+ characters`,
      met: password.length >= MIN_LENGTH,
    },
    { id: "letter", label: "At least one letter", met: hasLetter },
    { id: "digit", label: "At least one number", met: hasDigit },
    {
      id: "notCommon",
      label: "Not a commonly leaked password",
      met: password.length > 0 && !BLOCKED_PASSWORDS.has(lower),
    },
    {
      id: "notPersonal",
      label: "Doesn't contain your name or email",
      met: password.length > 0 && !personalHit,
    },
  ];
}

/**
 * Server-side helper: extracts personalTokens from the registration body
 * so the rules match the client's. Caller should pass the trimmed name
 * and the email's local-part.
 */
export function personalTokensFor({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}): string[] {
  const tokens: string[] = [];
  if (name) {
    for (const piece of name.split(/\s+/)) {
      if (piece.length >= 3) tokens.push(piece);
    }
  }
  if (email) {
    const local = email.split("@")[0];
    if (local && local.length >= 3) tokens.push(local);
  }
  return tokens;
}

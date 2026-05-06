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
// Personal-token substring match minimum length. 3-char tokens (Joe, Tom,
// Lee, etc.) generated way too many false positives so we only flag
// tokens >= 5 chars. Empirically this still catches the things people
// actually leak (their full first name or email local-part).
const PERSONAL_TOKEN_MIN_LENGTH = 5;

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

  // Soft personal-info penalty. We only consider tokens >= 5 chars so
  // short common name fragments like "Joe" / "Tom" / "Lee" don't trip
  // every password that happens to contain those letters. The match is
  // a soft penalty (drop one rank) rather than a hard cap, so a long
  // strong password isn't slammed to Weak just because it contains the
  // user's email's local-part.
  const personalHit = personalTokens.some(
    (t) => t.length >= PERSONAL_TOKEN_MIN_LENGTH && lower.includes(t.toLowerCase()),
  );

  // Score bands — length is the primary signal per NIST SP 800-63B.
  // A long all-letter passphrase is strong; a short complex password
  // isn't. Two character classes earn a bonus rank.
  let raw: 0 | 1 | 2 | 3 | 4;
  if (len >= 20) {
    raw = 4;                            // Strong regardless of classes
  } else if (len >= 16) {
    raw = classes >= 2 ? 4 : 3;         // 16+ : Good or Strong
  } else if (len >= 12) {
    raw = classes >= 2 ? 3 : 2;         // 12-15: OK or Good
  } else if (len >= 10) {
    raw = classes >= 2 ? 2 : 1;         // 10-11: Weak or OK
  } else {
    // len 8-9
    raw = classes >= 2 ? 2 : 1;
  }

  // Soft personal-info penalty: drop one rank, floor at 1.
  const score = (personalHit ? Math.max(1, raw - 1) : raw) as 0 | 1 | 2 | 3 | 4;

  const label =
    score === 4 ? "Strong" : score === 3 ? "Good" : score === 2 ? "OK" : "Weak";

  const hint = personalHit
    ? "Avoid using your name or email in the password — that's the first thing attackers try."
    : score >= 3
      ? ""
      : score === 2
        ? "Add a few more characters or a symbol to push it up to Good."
        : classes < 2
          ? "Mix in letters and numbers (or a symbol) to harden it."
          : "Make it a few characters longer for extra strength.";

  // Surface the personal-info miss in the requirements list.
  const finalRequirements = personalHit
    ? requirements.map((r) => (r.id === "notPersonal" ? { ...r, met: false } : r))
    : requirements;

  return {
    score,
    label,
    hint,
    requirements: finalRequirements,
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
    (t) => t.length >= PERSONAL_TOKEN_MIN_LENGTH && lower.includes(t.toLowerCase()),
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

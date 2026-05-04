// Lightweight profanity filter for live chat. Mirrors a small wordlist;
// the goal is to soften the room, not produce a perfect block.
// We mask matches with asterisks rather than reject the whole message —
// keeps the conversation flowing.

const BLOCKED = [
  "fuck", "fucking", "fucker", "fucked",
  "shit", "shitty",
  "bitch", "bitches",
  "asshole", "ass",
  "dick", "dicks",
  "cunt",
  "nigger", "nigga", "nigg",
  "faggot", "fag",
  "retard", "retarded",
  "whore", "slut",
  "kike", "spic", "chink",
];

const PATTERN = new RegExp(
  `\\b(${BLOCKED.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "gi",
);

export function maskProfanity(input: string): { masked: string; flagged: boolean } {
  let flagged = false;
  const masked = input.replace(PATTERN, (m) => {
    flagged = true;
    if (m.length <= 2) return "*".repeat(m.length);
    return m[0] + "*".repeat(m.length - 1);
  });
  return { masked, flagged };
}

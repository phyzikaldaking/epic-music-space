const BLOCKED_DOMAIN_PARTS = [
  "onlyfans",
  "fansly",
  "pornhub",
  "xvideos",
  "xhamster",
  "redtube",
  "stripchat",
  "chaturbate",
  "cam4",
  "manyvids",
  "sextpanther",
  "adultfriendfinder",
];

const BLOCKED_SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "is.gd",
  "cutt.ly",
  "shorturl.at",
];

const ADULT_PROMO_PATTERN =
  /\b(onlyfans|fansly|porn|xxx|adult\s?site|cam\s?site|escort|nude(s)?|sex\s?cam|nsfw\s?link|18\+)\b/i;

const HIGH_RISK_SPAM_PATTERN =
  /\b(buy\s+followers|instant\s+followers|free\s+money|guaranteed\s+income|crypto\s+giveaway|pump\s+and\s+dump|telegram\s+signal)\b/i;

const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;

export type TrustSafetyVerdict =
  | { ok: true }
  | { ok: false; code: "ADULT_PROMO" | "SPAM_PROMO"; message: string };

function extractUrls(input: string) {
  return input.match(URL_PATTERN) ?? [];
}

function extractHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function hasBlockedDomain(input: string) {
  const lower = input.toLowerCase();
  return BLOCKED_DOMAIN_PARTS.find((domain) =>
    lower.includes(domain),
  );
}

export function validateTrustSafetyInput(...parts: Array<string | null | undefined>): TrustSafetyVerdict {
  const text = parts.filter(Boolean).join(" \n ").trim();
  if (!text) return { ok: true };

  const blockedDomain = hasBlockedDomain(text);
  if (blockedDomain) {
    return {
      ok: false,
      code: "ADULT_PROMO",
      message: `Links to ${blockedDomain} are not allowed.`,
    };
  }

  const urls = extractUrls(text);
  if (urls.length >= 4) {
    return {
      ok: false,
      code: "SPAM_PROMO",
      message: "Too many links in one submission.",
    };
  }

  for (const url of urls) {
    const host = extractHost(url);
    if (!host) continue;

    if (BLOCKED_SHORTENERS.some((d) => host === d || host.endsWith(`.${d}`))) {
      return {
        ok: false,
        code: "SPAM_PROMO",
        message: "Shortened links are not allowed. Please use a direct URL.",
      };
    }

    if (BLOCKED_DOMAIN_PARTS.some((d) => host === d || host.endsWith(`.${d}`))) {
      return {
        ok: false,
        code: "ADULT_PROMO",
        message: "Adult or sexual promotion links are not allowed.",
      };
    }
  }

  if (ADULT_PROMO_PATTERN.test(text)) {
    return {
      ok: false,
      code: "ADULT_PROMO",
      message: "Adult or sexual promotion is not allowed.",
    };
  }

  if (HIGH_RISK_SPAM_PATTERN.test(text)) {
    return {
      ok: false,
      code: "SPAM_PROMO",
      message: "Spam-like promotional language is not allowed.",
    };
  }

  return { ok: true };
}

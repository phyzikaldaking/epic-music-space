const fallbackSiteUrl =
  process.env.NODE_ENV === "production"
    ? "https://www.epicmusicspace.com"
    : "http://localhost:3000";

export function getSiteUrl() {
  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  // NEXT_PUBLIC_SITE_URL may be a comma-separated list (used by the anti-fraud
  // impression gate to allow multiple origins). Always use the first entry as
  // the canonical base URL for emails and redirects.
  const primaryUrl = configuredSiteUrl?.split(",")[0]?.trim();

  if (!primaryUrl?.startsWith("http")) {
    return fallbackSiteUrl;
  }

  return primaryUrl.replace(/\/$/, "");
}

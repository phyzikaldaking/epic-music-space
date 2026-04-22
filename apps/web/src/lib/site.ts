const fallbackSiteUrl =
  process.env.NODE_ENV === "production"
    ? "https://epicmusicspace.com"
    : "http://localhost:3000";

export function getSiteUrl() {
  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!configuredSiteUrl?.startsWith("http")) {
    return fallbackSiteUrl;
  }

  return configuredSiteUrl.replace(/\/$/, "");
}

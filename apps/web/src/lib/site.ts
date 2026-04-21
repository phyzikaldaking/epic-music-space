const fallbackSiteUrl = "https://epicmusicspace.com";

export function getSiteUrl() {
  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!configuredSiteUrl?.startsWith("http")) {
    return fallbackSiteUrl;
  }

  return configuredSiteUrl.replace(/\/$/, "");
}

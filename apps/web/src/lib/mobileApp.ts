const appStoreId = process.env.NEXT_PUBLIC_IOS_APP_STORE_ID?.trim() ?? "";
const androidPackageId = process.env.NEXT_PUBLIC_ANDROID_PACKAGE_ID?.trim() || "com.epicmusicspace.app";
const androidStoreUrl = process.env.NEXT_PUBLIC_ANDROID_STORE_URL?.trim() ?? "";
const androidLive = process.env.NEXT_PUBLIC_ANDROID_APP_LIVE === "true";

export type MobilePlatform = "ios" | "android";

export type MobileStoreLink = {
  platform: MobilePlatform;
  label: string;
  badge: string;
  href: string | null;
  available: boolean;
  statusText: string;
};

function buildIosUrl(id: string) {
  return `https://apps.apple.com/app/epic-music-space/id${id}`;
}

function buildAndroidUrl(packageId: string) {
  return `https://play.google.com/store/apps/details?id=${packageId}`;
}

export const mobileStoreLinks: Record<MobilePlatform, MobileStoreLink> = {
  ios: {
    platform: "ios",
    label: "App Store",
    badge: "iPhone app",
    href: appStoreId ? buildIosUrl(appStoreId) : null,
    available: Boolean(appStoreId),
    statusText: appStoreId ? "Available on the App Store" : "iPhone release coming soon",
  },
  android: {
    platform: "android",
    label: "Google Play",
    badge: "Android app",
    href: androidStoreUrl || (androidLive ? buildAndroidUrl(androidPackageId) : null),
    available: Boolean(androidStoreUrl || androidLive),
    statusText: androidStoreUrl || androidLive ? "Available on Google Play" : "Android release coming soon",
  },
};

export function getStoreLink(platform: MobilePlatform) {
  return mobileStoreLinks[platform];
}

export function getMobileReleaseSummary() {
  const available = Object.values(mobileStoreLinks).filter((item) => item.available);
  const pending = Object.values(mobileStoreLinks).filter((item) => !item.available);
  return { available, pending };
}
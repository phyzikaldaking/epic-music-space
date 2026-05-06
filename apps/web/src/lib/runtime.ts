/**
 * Runtime environment helpers — answer questions like "are we inside the
 * Capacitor mobile app shell?" without dragging in any Capacitor APIs.
 *
 * Used for graceful degradation when a feature works in a real browser
 * but is blocked / broken inside a WebView. The most painful case today:
 * Google explicitly forbids OAuth in embedded WebViews
 * (https://developers.googleblog.com/en/modernizing-oauth-interactions-in-native-apps-for-better-usability-and-security/)
 * — the user gets a "This browser or app may not be secure" error page
 * if they tap Continue with Google inside a Capacitor WKWebView.
 */

export function isCapacitorWebView(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor sets window.Capacitor on every page running in the native
  // shell. The isNativePlatform() helper distinguishes the actual
  // mobile app from a web browser inspecting the same code.
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  // Fallback: some Capacitor versions don't expose isNativePlatform until
  // after the bridge bootstraps. Sniff the user-agent prefix Capacitor
  // appends in WKWebView / Android WebView.
  const ua = navigator.userAgent || "";
  return /CapacitorWebView/i.test(ua) || /epic-music-space\/\d/i.test(ua);
}

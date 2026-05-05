/**
 * Capacitor native bridge helpers.
 *
 * All imports are dynamic and only evaluated in the native app shell — they
 * are never bundled or executed in the browser, so there is no bundle cost.
 *
 * Usage:
 *   import { initCapacitorBridge } from "@/lib/capacitor";
 *   useEffect(() => { initCapacitorBridge(); }, []);
 */

/** Returns true when running inside the iOS / Android native app shell. */
export function isNativeApp(): boolean {
  return (
    typeof window !== "undefined" &&
    // Capacitor sets this on the window in the native WebView.
    !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.()
  );
}

/** Returns "ios" | "android" | "web". */
export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const cap = (
    window as unknown as { Capacitor?: { getPlatform?: () => string } }
  ).Capacitor;
  const p = cap?.getPlatform?.();
  if (p === "ios" || p === "android") return p;
  return "web";
}

/**
 * Boot the native bridge listeners.
 * Call once from the root layout (client component) after mount.
 *
 * Handles:
 * - App resume → hard-reload if the page is stale (> 5 min in background)
 * - Back-button on Android → go back or exit to home
 * - StatusBar / SplashScreen cleanup
 * - Network change → show/hide offline banner
 */
export async function initCapacitorBridge(): Promise<void> {
  if (!isNativeApp()) return;

  // ── App plugin ───────────────────────────────────────────────────────────
  const { App } = await import("@capacitor/app");
  const { Network } = await import("@capacitor/network");
  const { SplashScreen } = await import("@capacitor/splash-screen");
  const { StatusBar, Style } = await import("@capacitor/status-bar");

  // Hide splash screen once the webview is ready (belt-and-suspenders).
  await SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {});

  // Keep status bar dark to match the app theme.
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  await StatusBar.setBackgroundColor({ color: "#050509" }).catch(() => {});

  // Track when the app went to background so we know if a reload is needed.
  let backgroundedAt = 0;
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) {
      backgroundedAt = Date.now();
    } else {
      // Came back to foreground.
      const stale =
        backgroundedAt > 0 && Date.now() - backgroundedAt > STALE_THRESHOLD_MS;
      if (stale) {
        // Force the webview to reload so users always see fresh content.
        window.location.reload();
      }
    }
  });

  // Android hardware back button — go back in history or exit app.
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  // Network awareness — dispatch a custom event the OfflineBanner can listen to.
  const status = await Network.getStatus();
  if (!status.connected) {
    window.dispatchEvent(new CustomEvent("ems:offline"));
  }

  Network.addListener("networkStatusChange", ({ connected }) => {
    if (connected) {
      window.dispatchEvent(new CustomEvent("ems:online"));
    } else {
      window.dispatchEvent(new CustomEvent("ems:offline"));
    }
  });
}

/**
 * Capacitor native bridge helpers.
 *
 * All imports are dynamic and only evaluated in the native app shell — they
 * are never bundled or executed in the browser, so there is no bundle cost.
 *
 * Usage:
 *   import { initCapacitorBridge } from "@/lib/capacitor";
 *   useEffect(() => { initCapacitorBridge(); }, []);
 *
 * Features:
 * - App resume → hard-reload if page is stale (> 5 min in background)
 * - Back-button on Android → go back or exit to home
 * - StatusBar / SplashScreen cleanup
 * - Network change → show/hide offline banner
 * - Deep-link handling → push URL into Next.js router
 * - Push notification registration + token forwarding to backend
 * - Push notification action → navigate to deep link in payload
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

  // ── Launch health check ──────────────────────────────────────────────────
  // If the platform reports a bad deploy (non-2xx from /api/health), we stay
  // on the offline fallback rather than showing a broken white screen. This
  // runs silently — no UI change needed when healthy.
  try {
    const healthRes = await fetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!healthRes.ok) {
      // Non-2xx (e.g. 503 maintenance) — dispatch event so UI can respond.
      window.dispatchEvent(
        new CustomEvent("ems:unhealthy", { detail: { status: healthRes.status } })
      );
    }
  } catch {
    // Network failure — offline events will handle the UI.
  }

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

  // ── Deep links ───────────────────────────────────────────────────────────
  // When the OS opens a universal link / app link, navigate in-app instead
  // of launching the browser. Handles share links, promo codes, artist pages.
  App.addListener("appUrlOpen", ({ url }) => {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname + parsed.search + parsed.hash;
      if (path && path !== "/") {
        window.location.href = path;
      }
    } catch {
      // Malformed URL — ignore.
    }
  });

  // ── Push Notifications ───────────────────────────────────────────────────
  const { PushNotifications } = await import("@capacitor/push-notifications");

  // Request permission; if already granted, skip the prompt.
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive === "granted") {
    await PushNotifications.register();
  }

  // Forward the device token to the backend so we can send targeted pushes.
  PushNotifications.addListener("registration", async ({ value: token }) => {
    try {
      await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform: nativePlatform() }),
      });
    } catch {
      // Non-critical — token will be resent on next launch.
    }
  });

  // Log registration errors without crashing the bridge.
  PushNotifications.addListener("registrationError", (err) => {
    console.warn("[EMS push] registration error", err);
  });

  // When a user taps a notification, navigate to the URL in the payload.
  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    ({ notification }) => {
      const url: string | undefined = (notification.data as Record<string, string>)?.url;
      if (url) {
        try {
          const parsed = new URL(url, window.location.origin);
          window.location.href = parsed.pathname + parsed.search + parsed.hash;
        } catch {
          // Ignore malformed deep-link payloads.
        }
      }
    }
  );

  // ── Native telemetry ─────────────────────────────────────────────────────
  // Record a lightweight session event (platform, app version, timestamp).
  // Only fires once per calendar day to keep backend load minimal.
  try {
    const { Device } = await import("@capacitor/device");
    const { Preferences } = await import("@capacitor/preferences");

    const today = new Date().toISOString().slice(0, 10);
    const { value: lastPing } = await Preferences.get({ key: "ems:last_telemetry_day" });

    if (lastPing !== today) {
      const [deviceInfo, appInfo] = await Promise.all([
        Device.getInfo(),
        App.getInfo().catch(() => null),
      ]);

      await Preferences.set({ key: "ems:last_telemetry_day", value: today });
      await fetch("/api/telemetry/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: deviceInfo.platform,
          osVersion: deviceInfo.osVersion,
          appVersion: appInfo?.version ?? "unknown",
          appBuild: appInfo?.build ?? "unknown",
        }),
      }).catch(() => {});
    }
  } catch {
    // Non-critical — skip silently.
  }
}

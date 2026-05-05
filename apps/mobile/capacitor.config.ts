import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.epicmusicspace.app",
  appName: "Epic Music Space",
  webDir: "www",
  server: {
    // Always loads the live production site — every Vercel deploy is
    // instantly reflected in the app with zero App Store update needed.
    url: "https://epicmusicspace.com",
    cleartext: false,
    androidScheme: "https",
    // Allow navigation within the same domain only.
    allowNavigation: ["epicmusicspace.com", "*.epicmusicspace.com"],
    // Error page shown while offline or if remote fails to load.
    errorPath: "index.html",
  },
  ios: {
    // Allow inline media playback (no fullscreen takeover).
    allowsLinkPreview: false,
    scrollEnabled: true,
    contentInset: "automatic",
    // Use native scroll (bouncy rubber-band feel on iOS).
    preferredContentMode: "mobile",
  },
  android: {
    // Keep the process alive when backgrounded so audio continues.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Initial scale = 1, must match the web viewport meta.
    initialFocus: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 400,
      backgroundColor: "#050509",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      // iOS-only: fade the splash over the first web paint.
      iosSpinnerStyle: "small",
      spinnerColor: "#1f4bd8",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#050509",
      overlaysWebView: false,
    },
    Keyboard: {
      // Resize only the body, not the entire webview — avoids layout jump.
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
    App: {
      // Ignore external URLs that leave the app shell.
      launchUrl: "https://epicmusicspace.com",
    },
  },
};

export default config;

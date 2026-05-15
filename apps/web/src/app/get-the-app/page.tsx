import type { Metadata } from "next";
import Link from "next/link";
import { getMobileReleaseSummary, mobileStoreLinks } from "@/lib/mobileApp";

export const metadata: Metadata = {
  title: "Get the App",
  description:
    "Download the Epic Music Space app for iOS and Android. Connect with artists live, vote on battles, discover viral music, and build your music community — all from your phone.",
  alternates: { canonical: "/get-the-app" },
  openGraph: {
    title: "Epic Music Space — Music's Biggest Social Platform on iOS & Android",
    description: "Connect with artists, discover viral tracks, and vote on battles in real time. Now on your phone.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
};

export default function GetTheAppPage() {
  const release = getMobileReleaseSummary();

  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      {/* Icon */}
      <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl border border-brand-500/30 bg-brand-500/15 shadow-2xl">
        <svg
          aria-hidden="true"
          className="h-12 w-12 text-accent-300"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
        </svg>
      </div>

      <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
        Epic Music Space
      </h1>
      <p className="mt-4 text-lg text-white/55">
        The full platform — live sessions, licensing, battles, AI — now in your pocket.
        Every time the site updates, the app updates with it. Instantly. No App Store
        update required.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/45">
        {release.available.map((item) => (
          <span key={item.platform} className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
            {item.badge} live
          </span>
        ))}
        {release.pending.map((item) => (
          <span key={item.platform} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/55">
            {item.badge} coming soon
          </span>
        ))}
      </div>

      {/* Store buttons */}
      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        {/* App Store */}
        <a
          href={mobileStoreLinks.ios.href ?? "/get-the-app"}
          target={mobileStoreLinks.ios.available ? "_blank" : undefined}
          rel={mobileStoreLinks.ios.available ? "noopener noreferrer" : undefined}
          className={`flex w-48 items-center gap-3 rounded-xl border px-5 py-3.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${mobileStoreLinks.ios.available ? "border-white/15 bg-white/5 hover:bg-white/10" : "border-white/10 bg-white/3 opacity-70"}`}
          aria-label={mobileStoreLinks.ios.available ? "Download on the App Store" : "iPhone release coming soon"}
        >
          <svg className="h-8 w-8 flex-shrink-0 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/>
          </svg>
          <div className="text-left">
            <p className="text-[10px] text-white/50">{mobileStoreLinks.ios.available ? "Download on the" : "Status"}</p>
            <p className="text-sm font-bold text-white">{mobileStoreLinks.ios.available ? "App Store" : "iPhone coming soon"}</p>
          </div>
        </a>

        {/* Google Play */}
        <a
          href={mobileStoreLinks.android.href ?? "/get-the-app"}
          target={mobileStoreLinks.android.available ? "_blank" : undefined}
          rel={mobileStoreLinks.android.available ? "noopener noreferrer" : undefined}
          className={`flex w-48 items-center gap-3 rounded-xl border px-5 py-3.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${mobileStoreLinks.android.available ? "border-white/15 bg-white/5 hover:bg-white/10" : "border-white/10 bg-white/3 opacity-70"}`}
          aria-label={mobileStoreLinks.android.available ? "Get it on Google Play" : "Android release coming soon"}
        >
          <svg className="h-8 w-8 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#EA4335" d="m1.22 0 10.42 10.41L1.22 0Z"/>
            <path fill="#FBBC04" d="M1.22 24 11.64 13.59 1.22 24Z"/>
            <path fill="#4285F4" d="M20.11 10.43 16.9 8.6 11.64 13.59l5.26 4.99 3.22-1.83a2.5 2.5 0 0 0 0-4.32Z"/>
            <path fill="#34A853" d="M1.22 0a2.06 2.06 0 0 0-.95.24L11.64 10.41l5.26-4.99L1.22 0Z"/>
            <path fill="#34A853" d="m.27 23.76 11.37-10.17L1.22 24a2.06 2.06 0 0 1-.95-.24Z"/>
            <path fill="#EA4335" d="M1.22 24a2.06 2.06 0 0 1-.95-.24L11.64 13.59.27.24A2.06 2.06 0 0 0 .22 1.26v21.48A2.06 2.06 0 0 0 1.22 24Z"/>
          </svg>
          <div className="text-left">
            <p className="text-[10px] text-white/50">{mobileStoreLinks.android.available ? "Get it on" : "Status"}</p>
            <p className="text-sm font-bold text-white">{mobileStoreLinks.android.available ? "Google Play" : "Android coming soon"}</p>
          </div>
        </a>
      </div>

      {/* Feature bullets */}
      <ul className="mt-14 grid gap-5 text-left sm:grid-cols-2">
        {[
          { icon: "⚡", title: "Always up to date", body: "Live web app inside a native shell. Every site improvement is instant — no waiting for App Store review." },
          { icon: "🎙️", title: "Live sessions", body: "Join and host live audio rooms, drop in on artists, react in real-time." },
          { icon: "⚔️", title: "Track battles", body: "Vote on 1v1, Royale, and Verzuz battles from anywhere. Feel the haptics." },
          { icon: "🎵", title: "License music", body: "Browse, preview, and purchase clear digital licenses in seconds." },
          { icon: "📲", title: "Native feel", body: "Dark status bar, safe-area insets, hardware back button, haptic feedback — feels at home on iOS and Android." },
          { icon: "🔒", title: "Secure", body: "HTTPS-only, no cleartext, same auth as the web. Your data is never stored locally." },
        ].map(({ icon, title, body }) => (
          <li
            key={title}
            className="flex gap-3 rounded-xl border border-white/8 bg-white/3 p-4"
          >
            <span className="text-2xl leading-none" aria-hidden="true">{icon}</span>
            <div>
              <p className="font-bold text-white">{title}</p>
              <p className="mt-0.5 text-sm text-white/50">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Fallback web link */}
      {release.pending.length > 0 && (
        <p className="mt-12 text-sm text-white/30">
          This page updates automatically as soon as the real store IDs are configured.
        </p>
      )}
      <p className="mt-3 text-sm text-white/30">
        Already on desktop?{" "}
        <Link href="/" className="text-accent-300 hover:text-accent-200 underline">
          Use the web app
        </Link>
      </p>
    </main>
  );
}

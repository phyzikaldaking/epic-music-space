import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Epic Music Space",
    short_name: "EMS",
    description:
      "License music, build a fanbase, battle artists. Listen, license, and own.",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050509",
    theme_color: "#0a0a0a",
    categories: ["music", "entertainment", "social", "shopping"],
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    lang: "en",
    dir: "ltr",
    // App-shortcut menu shown on long-press of the home-screen icon on
    // Android, and in the right-click menu of an installed PWA on
    // desktop. iOS Safari ignores it for now.
    shortcuts: [
      { name: "Feed", short_name: "Feed", url: "/feed", description: "Your artist and fan activity feed" },
      { name: "Marketplace", short_name: "Market", url: "/marketplace", description: "Browse and license independent music" },
      { name: "Versus", short_name: "Versus", url: "/versus", description: "Fan-voted song battles" },
      { name: "Messages", short_name: "DMs", url: "/messages", description: "Direct messages" },
      { name: "Dashboard", short_name: "Dash", url: "/dashboard", description: "Your studio analytics and earnings" },
      { name: "Leaderboard", short_name: "Charts", url: "/leaderboard", description: "Top artists and trending tracks" },
    ],
  };
}

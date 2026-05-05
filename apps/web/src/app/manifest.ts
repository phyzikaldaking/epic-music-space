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
    // App-shortcut menu shown on long-press of the home-screen icon on
    // Android, and in the right-click menu of an installed PWA on
    // desktop. iOS Safari ignores it for now.
    shortcuts: [
      { name: "Feed", url: "/feed" },
      { name: "Marketplace", url: "/marketplace" },
      { name: "Messages", url: "/messages" },
      { name: "Dashboard", url: "/dashboard" },
    ],
  };
}

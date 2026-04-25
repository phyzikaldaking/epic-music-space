import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Epic Music Space",
    short_name: "EMS",
    description:
      "License cinematic tracks, discover indie artists, and release music with clear digital rights.",
    start_url: "/",
    display: "standalone",
    background_color: "#050509",
    theme_color: "#0a0a0a",
    categories: ["music", "entertainment", "business"],
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

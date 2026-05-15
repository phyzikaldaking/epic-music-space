export const emsProductMap = [
  { label: "Studio", href: "/studio/try", group: "Create", keywords: ["daw", "record", "mix", "edit", "master"] },
  { label: "Beat Machine", href: "/studio/beat-machine", group: "Create", keywords: ["drums", "pads", "sequencer", "beats"] },
  { label: "Listening Sessions", href: "/listening-sessions", group: "Live", keywords: ["live", "rooms", "events", "go live"] },
  { label: "Marketplace", href: "/marketplace", group: "Sell", keywords: ["beats", "services", "licenses", "engineers"] },
  { label: "Dashboard", href: "/dashboard", group: "Manage", keywords: ["home", "projects", "analytics", "account"] },
  { label: "Pricing", href: "/pricing", group: "Business", keywords: ["plans", "subscriptions", "upgrade"] },
  { label: "Upload Music", href: "/upload", group: "Create", keywords: ["songs", "tracks", "files"] },
  { label: "Creator Profile", href: "/profile", group: "Identity", keywords: ["artist", "producer", "engineer", "brand"] },
  { label: "Schedule Session", href: "/listening-sessions?schedule=1", group: "Live", keywords: ["calendar", "event", "booking"] },
  { label: "AI Assistant", href: "/studio/try?assistant=1", group: "AI", keywords: ["help", "coach", "repair", "suggestions"] },
];

export type EmsProductMapItem = (typeof emsProductMap)[number];

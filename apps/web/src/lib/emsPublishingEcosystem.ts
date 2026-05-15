export const emsPublishingAiSystems = [
  {
    id: "ai-publishing-assistant",
    title: "AI Publishing Assistant",
    href: "/publishing/assistant",
    description: "Guide creators through publishing metadata, PRO registration readiness, songwriter credits, splits, ISRC/ISWC fields, and release compliance.",
    outputs: ["metadata_checklist", "split_recommendations", "pro_readiness", "release_warnings", "publishing_summary"],
  },
  {
    id: "ai-sync-licensing-engine",
    title: "AI Sync Licensing Engine",
    href: "/licensing/sync-ai",
    description: "Analyze songs for mood, genre, energy, scene fit, brand alignment, tempo, lyrical risk, and licensing opportunities.",
    outputs: ["mood_tags", "scene_matches", "brand_fit", "risk_flags", "license_pitch"],
  },
  {
    id: "ai-release-planner",
    title: "AI Release Planner",
    href: "/distribution/release-planner",
    description: "Build rollout timelines, asset checklists, listening session plans, content calendars, pre-save strategy, and launch sequencing.",
    outputs: ["rollout_timeline", "asset_checklist", "session_plan", "content_calendar", "launch_sequence"],
  },
];

export const emsCrossPlatformDashboards = [
  { id: "spotify", title: "Spotify Dashboard", href: "/analytics/platforms/spotify", description: "Streams, saves, listeners, followers, playlist adds, and release trends." },
  { id: "youtube", title: "YouTube Dashboard", href: "/analytics/platforms/youtube", description: "Views, watch time, subscribers, shorts performance, traffic sources, and retention." },
  { id: "tiktok", title: "TikTok Dashboard", href: "/analytics/platforms/tiktok", description: "Video views, sounds usage, shares, profile clicks, follower growth, and trend signals." },
  { id: "instagram", title: "Instagram Dashboard", href: "/analytics/platforms/instagram", description: "Reels, stories, engagement, profile actions, reach, saves, and campaign performance." },
  { id: "apple-music", title: "Apple Music Dashboard", href: "/analytics/platforms/apple-music", description: "Plays, Shazams, listeners, playlist activity, and release discovery signals." },
  { id: "soundcloud", title: "SoundCloud Dashboard", href: "/analytics/platforms/soundcloud", description: "Plays, reposts, comments, followers, downloads, and community engagement." },
];

export const emsAppEcosystem = [
  { id: "studio-plugins", title: "Studio Plugin Marketplace", href: "/apps/studio-plugins", description: "Third-party effects, instruments, workflow panels, meters, and AI tools inside EMS Studio." },
  { id: "creator-apps", title: "Creator Apps", href: "/apps/creator", description: "Apps for marketing, publishing, analytics, content, collaboration, finance, and fan engagement." },
  { id: "developer-platform", title: "Developer Platform", href: "/developers", description: "APIs, webhooks, OAuth apps, SDKs, templates, and revenue share for EMS developers." },
  { id: "integration-hub", title: "Integration Hub", href: "/integrations", description: "Connect Apple Music, Spotify, YouTube, TikTok, Instagram, Stripe, Supabase, and creator tools." },
  { id: "automation-builder", title: "Automation Builder", href: "/apps/automation-builder", description: "Build workflows that connect sessions, releases, marketplace sales, CRM, invoices, notifications, and AI actions." },
];

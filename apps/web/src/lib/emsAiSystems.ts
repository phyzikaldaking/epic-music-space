export const emsAiCreationTools = [
  {
    id: "ai-beat-generator",
    title: "AI Beat Generator",
    href: "/studio/try?tool=ai-beat-generator",
    description: "Generate BPM, drum pattern, melody direction, arrangement, and sound palette from mood, genre, and artist references.",
    inputs: ["genre", "mood", "bpm", "key", "reference", "energy"],
  },
  {
    id: "ai-vocal-cleanup",
    title: "AI Vocal Cleanup",
    href: "/studio/try?tool=ai-vocal-cleanup",
    description: "Recommend cleanup steps for noise, harshness, muddiness, breath control, de-essing, gain staging, and vocal chain prep.",
    inputs: ["audio", "room_noise", "style", "target_loudness"],
  },
  {
    id: "ai-songwriting-assistant",
    title: "AI Songwriting Assistant",
    href: "/studio/try?tool=ai-songwriting-assistant",
    description: "Create hooks, verses, bridges, ad-libs, rhyme patterns, and song structure while preserving artist identity.",
    inputs: ["topic", "emotion", "cadence", "genre", "song_section"],
  },
  {
    id: "ai-mix-review",
    title: "AI Mix Review",
    href: "/studio/try?tool=ai-mix-review",
    description: "Analyze session balance, low-end, stereo width, vocal presence, clipping risk, masking, and release readiness.",
    inputs: ["session", "reference_track", "platform_target"],
  },
];

export const emsMarketplaceRecommendationSignals = [
  "creator_role",
  "genre",
  "budget",
  "project_stage",
  "recent_searches",
  "saved_items",
  "collaboration_history",
  "purchase_history",
  "session_activity",
];

export const emsReferralLoops = [
  {
    id: "invite-to-session",
    title: "Invite to Listening Session",
    reward: "Host visibility boost and guest signup credit.",
  },
  {
    id: "refer-creator",
    title: "Refer a Creator",
    reward: "Marketplace fee credit after first paid transaction.",
  },
  {
    id: "share-studio",
    title: "Share Studio Room",
    reward: "Profile badge and promoted studio placement points.",
  },
  {
    id: "battle-invite",
    title: "Battle Invite Loop",
    reward: "Leaderboard points for verified invite participation.",
  },
];

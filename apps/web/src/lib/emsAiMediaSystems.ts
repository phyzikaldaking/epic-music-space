export const emsAiMediaSystems = [
  {
    id: "ai-stem-separation",
    title: "AI Stem Separation",
    href: "/studio/try?tool=ai-stem-separation",
    description: "Separate uploaded songs into vocals, drums, bass, melody, and instrumental stems for remixing, sampling, and mix prep.",
    outputs: ["vocals", "drums", "bass", "melody", "instrumental"],
  },
  {
    id: "ai-autotune-assistant",
    title: "AI Autotune Assistant",
    href: "/studio/try?tool=ai-autotune-assistant",
    description: "Detect key and scale, suggest retune speed, humanize settings, harmony options, and vocal correction strategy.",
    outputs: ["key_detection", "scale_detection", "retune_speed", "humanize", "harmony_plan"],
  },
  {
    id: "ai-cover-art-generator",
    title: "AI Cover Art Generator",
    href: "/creator/assets/cover-art",
    description: "Generate single covers, album covers, motion cover concepts, social crops, and release artwork direction.",
    outputs: ["single_cover", "album_cover", "motion_cover", "social_crops", "art_direction"],
  },
  {
    id: "ai-video-reel-generator",
    title: "AI Video Reel Generator",
    href: "/creator/assets/reels",
    description: "Create short-form video concepts for TikTok, Reels, Shorts, listening session trailers, and release previews.",
    outputs: ["vertical_reel", "session_trailer", "release_teaser", "lyric_clip", "performance_clip"],
  },
  {
    id: "ai-promo-campaign-builder",
    title: "AI Promo Campaign Builder",
    href: "/creator/campaigns/ai-builder",
    description: "Build release rollout plans, captions, hashtags, ad angles, email copy, visual prompts, and posting calendars.",
    outputs: ["rollout_plan", "captions", "hashtags", "ad_angles", "email_copy", "content_calendar"],
  },
];

export const emsAiMediaGuardrails = [
  "Require user ownership or permission for uploaded audio and artwork references.",
  "Clearly label AI-generated creative assets before commercial use.",
  "Keep destructive edits non-destructive until the user confirms export.",
  "Store original uploads separately from generated stems, masters, and assets.",
  "Show estimated processing time, credit usage, and export format before generation.",
];

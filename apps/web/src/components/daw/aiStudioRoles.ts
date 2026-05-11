export type AiStudioRoleId =
  | "engineer"
  | "producer"
  | "mix_doctor"
  | "mastering"
  | "publishing"
  | "voice_command";

export type AiStudioRole = {
  id: AiStudioRoleId;
  name: string;
  shortName: string;
  status: "live" | "next" | "planned";
  promise: string;
  responsibilities: string[];
  starterPrompts: string[];
};

export const AI_STUDIO_ROLES: AiStudioRole[] = [
  {
    id: "engineer",
    name: "AI Engineer",
    shortName: "Engineer",
    status: "live",
    promise: "Coach the artist through recording, mic setup, gain staging, clean takes, punch-ins, and session readiness.",
    responsibilities: [
      "Mic and room setup guidance",
      "Input level and clipping warnings",
      "Recording plan and take selection",
      "Punch-in and retake recommendations",
      "Vocal-chain suggestions for rap, melodic, adlib, and performance takes",
    ],
    starterPrompts: [
      "Walk me through recording my first vocal take.",
      "Tell me how to set my mic level before I record.",
      "Give me a clean rap vocal chain.",
      "Coach me through punch-ins for this verse.",
    ],
  },
  {
    id: "producer",
    name: "AI Producer",
    shortName: "Producer",
    status: "next",
    promise: "Shape the creative direction: BPM, song structure, beat energy, hook placement, and arrangement moves.",
    responsibilities: [
      "BPM and key direction",
      "Song section mapping",
      "Hook and bridge suggestions",
      "Drum and 808 variation ideas",
      "Arrangement notes for momentum and replay value",
    ],
    starterPrompts: [
      "Help me structure this song.",
      "What should happen after the hook?",
      "Give me a harder second verse arrangement.",
      "Suggest a beat direction for a dark Atlanta record.",
    ],
  },
  {
    id: "mix_doctor",
    name: "AI Mix Doctor",
    shortName: "Mix Doctor",
    status: "next",
    promise: "Diagnose mix issues and recommend exact fixes for vocal level, mud, harshness, low-end masking, stereo width, and loudness.",
    responsibilities: [
      "Vocal level diagnosis",
      "Kick and 808 masking notes",
      "EQ and compressor move recommendations",
      "Phase and stereo width warnings",
      "Reference-track comparison notes",
    ],
    starterPrompts: [
      "What is wrong with my mix?",
      "Tell me why my vocal does not sit right.",
      "Give me EQ moves for this vocal.",
      "How do I make this mix hit harder?",
    ],
  },
  {
    id: "mastering",
    name: "AI Mastering Engineer",
    shortName: "Mastering",
    status: "planned",
    promise: "Prepare export-ready masters for streaming, club, performance, battle, TikTok, broadcast, and sync placement.",
    responsibilities: [
      "LUFS and true-peak guidance",
      "Limiter and clipping checks",
      "Alternate master versions",
      "Mono compatibility warnings",
      "Release readiness checklist",
    ],
    starterPrompts: [
      "Master this for streaming.",
      "Give me a club master checklist.",
      "Is this too loud?",
      "Create a performance master plan.",
    ],
  },
  {
    id: "publishing",
    name: "AI Publishing Assistant",
    shortName: "Publishing",
    status: "planned",
    promise: "Turn a finished session into a release with metadata, split reminders, licensing guidance, promo copy, and marketplace readiness.",
    responsibilities: [
      "Metadata and credits checklist",
      "Split-sheet reminders",
      "Beat/license pricing suggestions",
      "Promo caption generation",
      "Release and marketplace checklist",
    ],
    starterPrompts: [
      "Help me publish this song.",
      "Write promo captions for this release.",
      "What metadata am I missing?",
      "Suggest beat license prices.",
    ],
  },
  {
    id: "voice_command",
    name: "Voice Command Studio",
    shortName: "Voice Command",
    status: "planned",
    promise: "Let artists run the studio with natural speech: record, stop, punch in, mute, solo, add effects, save versions, and publish.",
    responsibilities: [
      "Natural-language studio commands",
      "Hands-free recording workflow",
      "Command confirmation and safety checks",
      "Transport and track control intents",
      "Session automation shortcuts",
    ],
    starterPrompts: [
      "Start recording after a four-count.",
      "Mute the beat and solo the vocal.",
      "Save this as hook take two.",
      "Create a clean version of this song.",
    ],
  },
];

export function getAiStudioRole(roleId: AiStudioRoleId): AiStudioRole {
  return AI_STUDIO_ROLES.find((role) => role.id === roleId) ?? AI_STUDIO_ROLES[0];
}

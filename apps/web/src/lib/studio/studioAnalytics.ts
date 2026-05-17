export const STUDIO_ANALYTICS_EVENTS = {
  STUDIO_OPENED: "studio_opened",
  PROJECT_CREATED: "project_created",
  PROJECT_OPENED: "project_opened",
  PROJECT_SAVED: "project_saved",
  RECORDING_STARTED: "recording_started",
  RECORDING_COMPLETED: "recording_completed",
  RECORDING_FAILED: "recording_failed",
  AI_GENERATION_STARTED: "ai_generation_started",
  AI_GENERATION_COMPLETED: "ai_generation_completed",
  AI_GENERATION_FAILED: "ai_generation_failed",
  EXPORT_STARTED: "export_started",
  EXPORT_COMPLETED: "export_completed",
  EXPORT_FAILED: "export_failed",
  STEM_EXPORT_STARTED: "stem_export_started",
  STEM_EXPORT_COMPLETED: "stem_export_completed",
  MOBILE_CAPTURE_CREATED: "mobile_capture_created",
  COLLABORATION_INVITE_SENT: "collaboration_invite_sent",
  COLLABORATOR_JOINED: "collaborator_joined",
  UPGRADE_CLICKED: "upgrade_clicked",
  SUBSCRIPTION_STARTED: "subscription_started",
  PAYWALL_VIEWED: "paywall_viewed",
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_COMPLETED: "onboarding_completed",
} as const;

export type StudioAnalyticsEvent =
  (typeof STUDIO_ANALYTICS_EVENTS)[keyof typeof STUDIO_ANALYTICS_EVENTS];

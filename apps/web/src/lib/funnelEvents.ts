export const FUNNEL_EVENTS = {
  visitorToSignupView: "funnel_visitor_to_signup_view",
  signupRoleSelected: "funnel_signup_role_selected",
  artistUploadView: "funnel_artist_upload_view",
  artistUploadAudioSelected: "funnel_artist_upload_audio_selected",
  artistUploadAudioCompleted: "funnel_artist_upload_audio_completed",
  artistUploadSubmitAttempt: "funnel_artist_upload_submit_attempt",
  artistUploadPublishCompleted: "funnel_artist_upload_publish_completed",
  artistDashboardToUploadClick: "funnel_artist_dashboard_to_upload_click",
  artistDashboardViewTiming: "funnel_artist_dashboard_view_timing",
  artistWelcomeVariantAssigned: "funnel_artist_welcome_variant_assigned",
} as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

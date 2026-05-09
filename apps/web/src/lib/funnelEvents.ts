export const FUNNEL_EVENTS = {
  homeSplitCtaClick: "funnel_home_split_cta_click",
  homeHeroVariantAssigned: "funnel_home_hero_variant_assigned",
  homeCtaCopyVariantAssigned: "funnel_home_cta_copy_variant_assigned",
  visitorToSignupView: "funnel_visitor_to_signup_view",
  signupRoleSelected: "funnel_signup_role_selected",
  signupCompleted: "funnel_signup_completed",
  artistUploadView: "funnel_artist_upload_view",
  artistUploadAudioSelected: "funnel_artist_upload_audio_selected",
  artistUploadAudioCompleted: "funnel_artist_upload_audio_completed",
  artistUploadSubmitAttempt: "funnel_artist_upload_submit_attempt",
  artistUploadPublishCompleted: "funnel_artist_upload_publish_completed",
  artistDashboardToUploadClick: "funnel_artist_dashboard_to_upload_click",
  artistDashboardViewTiming: "funnel_artist_dashboard_view_timing",
  artistWelcomeVariantAssigned: "funnel_artist_welcome_variant_assigned",
  studioRootDestinationAssigned: "funnel_studio_root_destination_assigned",
  studioRootCtaClick: "funnel_studio_root_cta_click",
  // Guest-mode funnel — fired from /studio/try (full DAW + PhoneStudio).
  // Tracks the full path: enter → stash → email submit → link click →
  // resume publish. Without these we can't tell which step is leaking,
  // and the whole guest funnel was built on faith.
  guestStudioEntered: "funnel_guest_studio_entered",
  guestPublishStash: "funnel_guest_publish_stash",
  guestEmailSubmitted: "funnel_guest_email_submitted",
  guestLinkClicked: "funnel_guest_link_clicked",
  guestPublishCompleted: "funnel_guest_publish_completed",
  guestShareLinkCreated: "funnel_guest_share_link_created",
  // Listener / buy-a-license funnel. The artist-side path was instrumented
  // first, but conversion lives on the buy side: visitor → marketplace →
  // track page → checkout click → Stripe session → purchase. Without
  // these we can't tell where buyers drop, and every change to the track
  // page is a guess.
  licenseMarketplaceView: "funnel_license_marketplace_view",
  licenseTrackView: "funnel_license_track_view",
  licenseCheckoutClicked: "funnel_license_checkout_clicked",
  licenseCheckoutSessionCreated: "funnel_license_checkout_session_created",
  licensePurchaseCompleted: "funnel_license_purchase_completed",
} as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

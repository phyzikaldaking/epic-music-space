export const emsNotifications = [
  { id: "session-live", title: "Listening session is live", action: "Join room", href: "/listening-sessions" },
  { id: "collab-invite", title: "New collaboration invite", action: "Review invite", href: "/collab/invites" },
  { id: "license-offer", title: "Beat license offer received", action: "Open licensing", href: "/licensing" },
  { id: "marketplace-sale", title: "Marketplace sale pending payout", action: "View revenue", href: "/revenue" },
];

export const creatorProfileSections = [
  { id: "identity", title: "Creator Identity", description: "Artist, producer, engineer, label, brand, or fan profile." },
  { id: "catalog", title: "Catalog", description: "Songs, beats, services, templates, sample packs, and session replays." },
  { id: "proof", title: "Proof", description: "Credits, reviews, badges, placements, and verified work history." },
  { id: "booking", title: "Booking", description: "Features, mixing, mastering, studio sessions, consultations, and events." },
];

export const collaborationInviteStates = ["draft", "sent", "accepted", "declined", "expired"] as const;

export const licenseTiers = [
  { id: "basic", name: "Basic", price: 29, rights: "MP3 lease, limited streams, non-exclusive." },
  { id: "premium", name: "Premium", price: 99, rights: "WAV lease, higher stream cap, monetized content allowed." },
  { id: "exclusive", name: "Exclusive", price: 499, rights: "Exclusive use, stems, contract required." },
  { id: "custom", name: "Custom", price: null, rights: "Negotiated terms for labels, brands, sync, and campaigns." },
];

export const revenueStreams = [
  { id: "subscriptions", title: "Subscriptions", description: "Starter, Pro, Prime Studio, Label, and Enterprise plans." },
  { id: "marketplace", title: "Marketplace", description: "Beats, services, samples, presets, templates, and features." },
  { id: "sessions", title: "Sessions", description: "Ticketed listening rooms, events, battles, and replays." },
  { id: "advertising", title: "Advertising", description: "Billboards, promoted studios, sponsored sessions, and brand placements." },
  { id: "licensing", title: "Licensing", description: "Beat licenses, sync packages, exclusive rights, and split-sheet automation." },
];

export const emsCreatorIntelligenceSystems = [
  {
    id: "ai-artist-manager",
    title: "AI Artist Manager",
    href: "/ai/artist-manager",
    description: "Coordinate creator goals, release timing, fan strategy, marketplace offers, session planning, content output, and career moves.",
    signals: ["release_history", "fan_growth", "catalog_quality", "marketplace_sales", "session_activity", "content_consistency"],
  },
  {
    id: "ai-talent-scouting",
    title: "AI Talent Scouting",
    href: "/ai/talent-scouting",
    description: "Identify high-potential artists, producers, engineers, and creators using engagement, retention, sales, collaboration, and trend signals.",
    signals: ["engagement_velocity", "repeat_listeners", "collab_demand", "marketplace_conversion", "session_attendance", "trend_fit"],
  },
  {
    id: "ai-business-forecasting",
    title: "AI Business Forecasting",
    href: "/ai/business-forecasting",
    description: "Forecast creator revenue, campaign results, marketplace demand, subscription growth, session attendance, and release momentum.",
    signals: ["revenue_history", "traffic", "conversion_rate", "fan_retention", "pricing", "launch_calendar"],
  },
  {
    id: "creator-credit-scoring",
    title: "Creator Credit Scoring",
    href: "/protocol/creator-credit",
    description: "Score creator reliability, delivery history, sales trust, engagement quality, reviews, credits, and verified collaboration outcomes.",
    signals: ["delivery_rate", "review_quality", "dispute_rate", "verified_credits", "repeat_customers", "platform_reputation"],
  },
  {
    id: "global-creator-network-graph",
    title: "Global Creator Network Graph",
    href: "/protocol/network-graph",
    description: "Map relationships between creators, fans, labels, brands, services, sessions, assets, rights, payments, and collaborations.",
    signals: ["collaboration_edges", "fan_edges", "transaction_edges", "rights_edges", "session_edges", "brand_edges"],
  },
];

export const emsCreatorIntelligenceGuardrails = [
  "Creator scores must explain the factors used and avoid hidden black-box penalties.",
  "Do not expose private financial or collaboration data without permission-aware access checks.",
  "Talent scouting should support discovery and opportunity, not discriminatory exclusion.",
  "Forecasts must be labeled as estimates and include confidence bands when possible.",
  "Creators should be able to correct inaccurate profile, rights, credit, or reputation data.",
];

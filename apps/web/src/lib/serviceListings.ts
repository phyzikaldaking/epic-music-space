import type { ServiceListingKind, Role } from "@ems/db";

export const SERVICE_KIND_META: Record<ServiceListingKind, {
  label: string;
  badge: string;
  category: "engineer" | "producer";
  isInstant: boolean; // true = downloadable on purchase, false = needs delivery
}> = {
  MIX:               { label: "Mix",            badge: "🎚️", category: "engineer", isInstant: false },
  MASTER:            { label: "Master",         badge: "🎛️", category: "engineer", isInstant: false },
  MIX_MASTER_BUNDLE: { label: "Mix + Master",   badge: "🎚️", category: "engineer", isInstant: false },
  PRODUCER_TEMPLATE: { label: "Project template", badge: "🧰", category: "producer", isInstant: true },
  BEAT:              { label: "Beat",           badge: "🥁", category: "producer", isInstant: true },
  DRUM_KIT:          { label: "Drum kit",       badge: "🥁", category: "producer", isInstant: true },
  SAMPLE_PACK:       { label: "Sample pack",    badge: "📦", category: "producer", isInstant: true },
  LESSON:            { label: "Lesson / 1:1",   badge: "🎓", category: "engineer", isInstant: false },
};

const ROLE_KINDS: Partial<Record<Role, ServiceListingKind[]>> = {
  ENGINEER: ["MIX", "MASTER", "MIX_MASTER_BUNDLE", "PRODUCER_TEMPLATE", "LESSON"],
  PRODUCER: ["BEAT", "DRUM_KIT", "SAMPLE_PACK", "PRODUCER_TEMPLATE", "LESSON"],
  ARTIST:   ["LESSON"], // artists can offer lessons; everything else funnels to ENGINEER/PRODUCER
};

export function kindsAllowedForRole(role: Role): ServiceListingKind[] {
  return ROLE_KINDS[role] ?? [];
}

export function canListServices(role: Role): boolean {
  return kindsAllowedForRole(role).length > 0;
}

import type { SubscriptionTier } from "@ems/db";

export type RoomTierLimits = {
  maxCapacity: number;
  maxDurationMinutes: number;
  canRecord: boolean;
  label: string;
};

const TIER_LIMITS: Record<SubscriptionTier, RoomTierLimits> = {
  FREE:       { maxCapacity: 25,    maxDurationMinutes: 30,  canRecord: false, label: "Free" },
  TRIAL:      { maxCapacity: 50,    maxDurationMinutes: 60,  canRecord: false, label: "Trial" },
  STARTER:    { maxCapacity: 100,   maxDurationMinutes: 120, canRecord: false, label: "Starter" },
  PRO:        { maxCapacity: 500,   maxDurationMinutes: 240, canRecord: true,  label: "Pro" },
  PRIME:      { maxCapacity: 2000,  maxDurationMinutes: 480, canRecord: true,  label: "Prime" },
  TEAM:       { maxCapacity: 2000,  maxDurationMinutes: 480, canRecord: true,  label: "Team" },
  LABEL_TIER: { maxCapacity: 5000,  maxDurationMinutes: 720, canRecord: true,  label: "Label" },
};

export function getRoomLimitsForTier(tier: SubscriptionTier): RoomTierLimits {
  return TIER_LIMITS[tier] ?? TIER_LIMITS.FREE;
}

export function tierAllowsRecording(tier: SubscriptionTier): boolean {
  return getRoomLimitsForTier(tier).canRecord;
}

export function getRoomEndsAt(startedAt: Date, tier: SubscriptionTier): Date {
  const { maxDurationMinutes } = getRoomLimitsForTier(tier);
  return new Date(startedAt.getTime() + maxDurationMinutes * 60_000);
}

export function isRoomExpired(
  startedAt: Date,
  tier: SubscriptionTier,
  now = new Date(),
): boolean {
  return getRoomEndsAt(startedAt, tier) <= now;
}

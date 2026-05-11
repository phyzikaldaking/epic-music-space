import type { SubscriptionTier } from "@ems/db";

export type RoomTierLimits = {
  maxCapacity: number;
  // Clubhouse-style "stage" seat cap. HOST + SPEAKER participants
  // count toward this; LISTENER doesn't. The host always occupies
  // seat 1, so the practical number of collaborators is stageLimit - 1.
  stageLimit: number;
  maxDurationMinutes: number;
  canRecord: boolean;
  label: string;
};

const TIER_LIMITS: Record<SubscriptionTier, RoomTierLimits> = {
  FREE:       { maxCapacity: 25,    stageLimit: 2,  maxDurationMinutes: 30,  canRecord: false, label: "Free" },
  TRIAL:      { maxCapacity: 50,    stageLimit: 3,  maxDurationMinutes: 60,  canRecord: false, label: "Trial" },
  STARTER:    { maxCapacity: 100,   stageLimit: 4,  maxDurationMinutes: 120, canRecord: false, label: "Starter" },
  PRO:        { maxCapacity: 500,   stageLimit: 6,  maxDurationMinutes: 240, canRecord: true,  label: "Pro" },
  PRIME:      { maxCapacity: 2000,  stageLimit: 8,  maxDurationMinutes: 480, canRecord: true,  label: "Prime" },
  TEAM:       { maxCapacity: 2000,  stageLimit: 8,  maxDurationMinutes: 480, canRecord: true,  label: "Team" },
  LABEL_TIER: { maxCapacity: 5000,  stageLimit: 12, maxDurationMinutes: 720, canRecord: true,  label: "Label" },
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

/** Stage seat count = HOST + SPEAKER currently in the room (leftAt is
 *  null). Used by the grant route to refuse promotion when the host's
 *  tier cap is full. */
export function isStageFull(stageCount: number, tier: SubscriptionTier): boolean {
  return stageCount >= getRoomLimitsForTier(tier).stageLimit;
}

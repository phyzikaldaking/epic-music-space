import { prisma } from "./prisma";

// Re-export the enum type from Prisma so callers don't import from @ems/db
export type BadgeType =
  | "EARLY_ADOPTER"
  | "INVITE_5"
  | "INVITE_10"
  | "INVITE_50"
  | "FIRST_BATTLE_WIN"
  | "FIRST_LICENSE_SOLD"
  | "LICENSE_HOLDER"
  | "TOP_ARTIST";

export const BADGE_META: Record<
  BadgeType,
  { label: string; icon: string; description: string; color: string }
> = {
  EARLY_ADOPTER: {
    label: "Early Adopter",
    icon: "🌟",
    description: "One of the first 1,000 members of Epic Music Space",
    color: "text-gold-400 border-gold-500/40 bg-gold-500/8",
  },
  INVITE_5: {
    label: "Connector",
    icon: "🤝",
    description: "Invited 5 friends to EMS",
    color: "text-brand-400 border-brand-500/40 bg-brand-500/8",
  },
  INVITE_10: {
    label: "Recruiter",
    icon: "📢",
    description: "Invited 10 friends to EMS — billboard credit unlocked",
    color: "text-brand-400 border-brand-500/40 bg-brand-500/10",
  },
  INVITE_50: {
    label: "Legend",
    icon: "👑",
    description: "Invited 50 friends — Prime plan credit unlocked",
    color: "text-gold-400 border-gold-500/50 bg-gold-500/12",
  },
  FIRST_BATTLE_WIN: {
    label: "Battle Tested",
    icon: "⚔️",
    description: "Won a Versus battle",
    color: "text-accent-400 border-accent-500/40 bg-accent-500/8",
  },
  FIRST_LICENSE_SOLD: {
    label: "First Sale",
    icon: "💰",
    description: "Sold your first license",
    color: "text-green-400 border-green-500/40 bg-green-500/8",
  },
  LICENSE_HOLDER: {
    label: "License Holder",
    icon: "🎟️",
    description: "Purchased your first music license",
    color: "text-accent-400 border-accent-500/40 bg-accent-500/8",
  },
  TOP_ARTIST: {
    label: "Top Artist",
    icon: "🏆",
    description: "Reached #1 on the EMS leaderboard",
    color: "text-gold-400 border-gold-500/50 bg-gold-500/12",
  },
};

/**
 * Award a badge to a user. No-ops if already awarded.
 * Returns the created badge or null if it already existed.
 */
export async function awardBadge(userId: string, type: BadgeType) {
  try {
    return await prisma.userBadge.create({
      data: { userId, type },
    });
  } catch {
    // P2002 = unique constraint violation (badge already exists) — safe to ignore
    return null;
  }
}

/**
 * Check invite milestone badges and issue actual rewards for a user.
 * Call this after a new user registers with their invite code.
 */
export async function checkInviteMilestones(inviterId: string) {
  const count = await prisma.inviteCode.count({
    where: { createdById: inviterId, usedById: { not: null } },
  });

  if (count >= 5) {
    const badge = await awardBadge(inviterId, "INVITE_5");
    if (badge) {
      // New milestone — notify about ad credit reward
      await prisma.notification.create({
        data: {
          userId: inviterId,
          type: "MILESTONE_REWARD",
          title: "5-invite milestone reached! 🎉",
          body: "You've unlocked a free City Billboard ad slot. Visit /ads to claim your credit.",
          metadata: { milestone: "INVITE_5", reward: "billboard_credit" },
        },
      });
    }
  }

  if (count >= 10) {
    const badge = await awardBadge(inviterId, "INVITE_10");
    if (badge) {
      // Level up their studio
      await prisma.studio.updateMany({
        where: { userId: inviterId },
        data: { level: { increment: 1 } },
      });
      await prisma.notification.create({
        data: {
          userId: inviterId,
          type: "MILESTONE_REWARD",
          title: "10-invite milestone reached! 📢",
          body: "Your studio level has been upgraded! Your profile now shows Premium Studio status.",
          metadata: { milestone: "INVITE_10", reward: "studio_level_up" },
        },
      });
    }
  }

  if (count >= 50) {
    const badge = await awardBadge(inviterId, "INVITE_50");
    if (badge) {
      // Grant Prime subscription tier
      await prisma.user.update({
        where: { id: inviterId },
        data: { subscriptionTier: "PRIME" as never },
      });
      await prisma.notification.create({
        data: {
          userId: inviterId,
          type: "MILESTONE_REWARD",
          title: "Legend status unlocked! 👑",
          body: "You've been upgraded to Prime — unlimited uploads, licenses, and Versus creation. All on us.",
          metadata: { milestone: "INVITE_50", reward: "prime_tier" },
        },
      });
    }
  }
}

/** Award EARLY_ADOPTER if total users < 1 000 */
export async function maybeAwardEarlyAdopter(userId: string) {
  const total = await prisma.user.count();
  if (total <= 1000) {
    await awardBadge(userId, "EARLY_ADOPTER");
  }
}

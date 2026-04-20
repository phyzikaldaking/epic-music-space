import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock ./prisma so @ems/db is never loaded ────────────────────────────────
vi.mock("../../lib/prisma", () => ({
  prisma: {
    userBadge: {
      create: vi.fn(),
    },
    inviteCode: {
      count: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma";
import { awardBadge, checkInviteMilestones, maybeAwardEarlyAdopter } from "../../lib/badges";

describe("awardBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a badge for the given user and type", async () => {
    const mockBadge = { id: "badge-1", userId: "user-1", type: "EARLY_ADOPTER" };
    vi.mocked(prisma.userBadge.create).mockResolvedValue(mockBadge as never);

    const result = await awardBadge("user-1", "EARLY_ADOPTER");
    expect(result).toEqual(mockBadge);
    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: "user-1", type: "EARLY_ADOPTER" },
    });
  });

  it("returns null when badge already exists (unique constraint violation)", async () => {
    vi.mocked(prisma.userBadge.create).mockRejectedValue(
      Object.assign(new Error("Unique constraint"), { code: "P2002" })
    );

    const result = await awardBadge("user-1", "EARLY_ADOPTER");
    expect(result).toBeNull();
  });

  it("returns null for any error during badge creation", async () => {
    vi.mocked(prisma.userBadge.create).mockRejectedValue(
      new Error("Some unexpected DB error")
    );

    const result = await awardBadge("user-1", "TOP_ARTIST");
    expect(result).toBeNull();
  });

  it("works for all badge types", async () => {
    const badgeTypes = [
      "EARLY_ADOPTER",
      "INVITE_5",
      "INVITE_10",
      "INVITE_50",
      "FIRST_BATTLE_WIN",
      "FIRST_LICENSE_SOLD",
      "LICENSE_HOLDER",
      "TOP_ARTIST",
    ] as const;

    for (const type of badgeTypes) {
      vi.mocked(prisma.userBadge.create).mockResolvedValue({ id: "b", userId: "u", type } as never);
      const result = await awardBadge("user-x", type);
      expect(result).not.toBeNull();
    }
  });
});

describe("checkInviteMilestones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("awards INVITE_5 when inviter has 5 accepted invites", async () => {
    vi.mocked(prisma.inviteCode.count).mockResolvedValue(5);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    await checkInviteMilestones("inviter-1");

    const createCalls = vi.mocked(prisma.userBadge.create).mock.calls.map(
      (call) => call[0].data.type
    );
    expect(createCalls).toContain("INVITE_5");
    expect(createCalls).not.toContain("INVITE_10");
    expect(createCalls).not.toContain("INVITE_50");
  });

  it("awards INVITE_5 and INVITE_10 when inviter has 10 accepted invites", async () => {
    vi.mocked(prisma.inviteCode.count).mockResolvedValue(10);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    await checkInviteMilestones("inviter-1");

    const createCalls = vi.mocked(prisma.userBadge.create).mock.calls.map(
      (call) => call[0].data.type
    );
    expect(createCalls).toContain("INVITE_5");
    expect(createCalls).toContain("INVITE_10");
    expect(createCalls).not.toContain("INVITE_50");
  });

  it("awards all invite badges when inviter has 50+ accepted invites", async () => {
    vi.mocked(prisma.inviteCode.count).mockResolvedValue(50);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    await checkInviteMilestones("inviter-1");

    const createCalls = vi.mocked(prisma.userBadge.create).mock.calls.map(
      (call) => call[0].data.type
    );
    expect(createCalls).toContain("INVITE_5");
    expect(createCalls).toContain("INVITE_10");
    expect(createCalls).toContain("INVITE_50");
  });

  it("awards no badges when invite count is below 5", async () => {
    vi.mocked(prisma.inviteCode.count).mockResolvedValue(4);

    await checkInviteMilestones("inviter-1");

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });

  it("awards no badges when invite count is 0", async () => {
    vi.mocked(prisma.inviteCode.count).mockResolvedValue(0);

    await checkInviteMilestones("inviter-1");

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });

  it("queries invites for the correct inviterId", async () => {
    vi.mocked(prisma.inviteCode.count).mockResolvedValue(3);

    await checkInviteMilestones("specific-inviter");

    expect(prisma.inviteCode.count).toHaveBeenCalledWith({
      where: { createdById: "specific-inviter", usedById: { not: null } },
    });
  });

  it("awards badges for count > threshold (e.g. 55 invites awards all)", async () => {
    vi.mocked(prisma.inviteCode.count).mockResolvedValue(55);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    await checkInviteMilestones("inviter-heavy");

    expect(prisma.userBadge.create).toHaveBeenCalledTimes(3);
  });
});

describe("maybeAwardEarlyAdopter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("awards EARLY_ADOPTER when total users is 1 (well under 1000)", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    await maybeAwardEarlyAdopter("user-1");

    expect(prisma.userBadge.create).toHaveBeenCalledWith({
      data: { userId: "user-1", type: "EARLY_ADOPTER" },
    });
  });

  it("awards EARLY_ADOPTER when total users is exactly 1000", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1000);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    await maybeAwardEarlyAdopter("user-1000");

    expect(prisma.userBadge.create).toHaveBeenCalledOnce();
  });

  it("does NOT award EARLY_ADOPTER when total users exceeds 1000", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1001);

    await maybeAwardEarlyAdopter("user-late");

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });

  it("does NOT award badge when user count is 5000", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(5000);

    await maybeAwardEarlyAdopter("late-user");

    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });
});

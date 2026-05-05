import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceMatchIfNeeded, tallyRounds } from "@/lib/verzuz";

const prismaMock = vi.hoisted(() => ({
  verzuzMatch: { findUnique: vi.fn(), update: vi.fn() },
  verzuzRound: { update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: () => null,
  CHANNELS: { versus: (matchId: string) => `ems:versus:${matchId}` },
}));

describe("verzuz", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when a match is still scheduled in the future", async () => {
    const startsAt = new Date("2030-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date("2029-12-31T23:00:00.000Z"));

    const match = {
      id: "m1",
      status: "SCHEDULED",
      startsAt,
      endsAt: null,
      currentRound: 1,
      totalRounds: 3,
      roundDurationSec: 180,
      rounds: [
        { id: "r1", roundNumber: 1, winner: null, votesA: 0, votesB: 0 },
      ],
    };
    prismaMock.verzuzMatch.findUnique.mockResolvedValue(match);

    const res = await advanceMatchIfNeeded("m1");
    expect(res).toBe(match);
    expect(prismaMock.verzuzRound.update).not.toHaveBeenCalled();
    expect(prismaMock.verzuzMatch.update).not.toHaveBeenCalled();
  });

  it("locks expired rounds and advances currentRound", async () => {
    const startsAt = new Date("2026-05-05T00:00:00.000Z");
    // 250s after start with 100s rounds => expectedRoundRaw=3, expectedRound=3
    vi.setSystemTime(new Date(startsAt.getTime() + 250_000));

    const match = {
      id: "m2",
      status: "LIVE",
      startsAt,
      endsAt: null,
      currentRound: 1,
      totalRounds: 3,
      roundDurationSec: 100,
      rounds: [
        { id: "r1", roundNumber: 1, winner: null, votesA: 3, votesB: 1 },
        { id: "r2", roundNumber: 2, winner: null, votesA: 1, votesB: 5 },
        { id: "r3", roundNumber: 3, winner: null, votesA: 0, votesB: 0 },
      ],
    };
    prismaMock.verzuzMatch.findUnique.mockResolvedValue(match);
    prismaMock.verzuzRound.update.mockResolvedValue(undefined);
    prismaMock.verzuzMatch.update.mockResolvedValue({
      ...match,
      currentRound: 3,
      rounds: [
        { ...match.rounds[0], winner: "A" },
        { ...match.rounds[1], winner: "B" },
        { ...match.rounds[2], winner: null },
      ],
    });

    const res = await advanceMatchIfNeeded("m2");
    expect(prismaMock.verzuzRound.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.verzuzMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m2" },
        data: expect.objectContaining({ currentRound: 3, status: "LIVE" }),
      }),
    );
    expect((res as any).currentRound).toBe(3);
  });

  it("completes the match, locks the final round, and sets endsAt", async () => {
    const startsAt = new Date("2026-05-05T00:00:00.000Z");
    // 301s after start with 100s rounds => expectedRoundRaw=4 => match ended (3 rounds)
    vi.setSystemTime(new Date(startsAt.getTime() + 301_000));

    const match = {
      id: "m3",
      status: "LIVE",
      startsAt,
      endsAt: null,
      currentRound: 3,
      totalRounds: 3,
      roundDurationSec: 100,
      rounds: [
        { id: "r1", roundNumber: 1, winner: "A", votesA: 3, votesB: 1 },
        { id: "r2", roundNumber: 2, winner: "B", votesA: 1, votesB: 5 },
        { id: "r3", roundNumber: 3, winner: null, votesA: 2, votesB: 2 },
      ],
    };
    prismaMock.verzuzMatch.findUnique.mockResolvedValue(match);
    prismaMock.verzuzRound.update.mockResolvedValue(undefined);
    prismaMock.verzuzMatch.update.mockResolvedValue({
      ...match,
      status: "COMPLETED",
      endsAt: new Date(),
      rounds: [
        match.rounds[0],
        match.rounds[1],
        { ...match.rounds[2], winner: "TIE" },
      ],
    });

    const res = await advanceMatchIfNeeded("m3");
    expect(prismaMock.verzuzRound.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.verzuzRound.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r3" },
        data: { winner: "TIE" },
      }),
    );
    expect(prismaMock.verzuzMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m3" },
        data: expect.objectContaining({ status: "COMPLETED", currentRound: 3 }),
      }),
    );
    expect((res as any).status).toBe("COMPLETED");
    expect((res as any).endsAt).toBeTruthy();
  });

  it("tallies rounds correctly", () => {
    expect(
      tallyRounds([
        { winner: "A" },
        { winner: "B" },
        { winner: "TIE" },
        { winner: null },
      ]),
    ).toEqual({ aWins: 1, bWins: 1, ties: 1 });
  });
});

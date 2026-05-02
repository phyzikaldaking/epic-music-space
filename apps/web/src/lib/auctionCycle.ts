export const AUCTION_CYCLE_HOURS = 24;
export const AUCTION_CYCLE_MS = AUCTION_CYCLE_HOURS * 60 * 60 * 1000;

export function getAuctionCycle(now = new Date()) {
  const epoch = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
  const elapsed = now.getTime() - epoch;
  const cycleNumber = Math.max(0, Math.floor(elapsed / AUCTION_CYCLE_MS));
  const startsAt = new Date(epoch + cycleNumber * AUCTION_CYCLE_MS);
  const endsAt = new Date(startsAt.getTime() + AUCTION_CYCLE_MS);
  return {
    cycleId: `ems-wall-${startsAt.toISOString().slice(0, 10)}`,
    cycleNumber,
    startsAt,
    endsAt,
    msRemaining: Math.max(0, endsAt.getTime() - now.getTime()),
  };
}

export function shouldResetAuctionCycle(lastResetAt: Date | null | undefined, now = new Date()) {
  const cycle = getAuctionCycle(now);
  if (!lastResetAt) return true;
  return lastResetAt.getTime() < cycle.startsAt.getTime();
}

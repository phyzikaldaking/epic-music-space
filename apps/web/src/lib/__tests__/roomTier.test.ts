import { describe, expect, it } from "vitest";
import { getRoomEndsAt, isRoomExpired } from "@/lib/roomTier";

describe("room session expiry", () => {
  it("calculates the expiry time from the host tier", () => {
    const startedAt = new Date("2026-05-05T00:00:00.000Z");

    expect(getRoomEndsAt(startedAt, "FREE").toISOString()).toBe(
      "2026-05-05T00:30:00.000Z",
    );
    expect(getRoomEndsAt(startedAt, "PRO").toISOString()).toBe(
      "2026-05-05T04:00:00.000Z",
    );
  });

  it("expires rooms at the tier limit", () => {
    const startedAt = new Date("2026-05-05T00:00:00.000Z");

    expect(isRoomExpired(startedAt, "FREE", new Date("2026-05-05T00:29:59.000Z"))).toBe(false);
    expect(isRoomExpired(startedAt, "FREE", new Date("2026-05-05T00:30:00.000Z"))).toBe(true);
  });
});

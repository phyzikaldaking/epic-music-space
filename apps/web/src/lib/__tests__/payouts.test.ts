import { describe, expect, it } from "vitest";
import { isoWeekPeriod } from "@/lib/payouts";

describe("isoWeekPeriod", () => {
  it("formats as YYYY-Www", () => {
    expect(isoWeekPeriod(new Date("2026-05-04T12:00:00Z"))).toBe("2026-W19");
  });

  it("agrees with itself across the same week", () => {
    const monday = new Date("2026-05-04T00:00:00Z");
    const sunday = new Date("2026-05-10T23:59:00Z");
    expect(isoWeekPeriod(monday)).toBe(isoWeekPeriod(sunday));
  });

  it("rolls forward on Monday", () => {
    const sunday = new Date("2026-05-10T23:59:00Z");
    const nextMonday = new Date("2026-05-11T00:00:00Z");
    expect(isoWeekPeriod(sunday)).not.toBe(isoWeekPeriod(nextMonday));
  });

  it("uses ISO week numbering at year boundaries", () => {
    // 2027-01-01 is a Friday; ISO week 53 of 2026.
    expect(isoWeekPeriod(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
  });
});

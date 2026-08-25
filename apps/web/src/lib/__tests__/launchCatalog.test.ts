import { describe, expect, it } from "vitest";
import { isPublicCatalogTrack } from "@/lib/launchCatalog";

describe("public catalog visibility", () => {
  it("excludes internal ledger fixtures", () => {
    expect(isPublicCatalogTrack({
      id: "cmor5fyqf0005ctu8o6tqmky1",
      title: "Ledger Test Song 1777896115862",
      artist: "Ledger Test Artist",
    })).toBe(false);
  });

  it("keeps legitimate artist songs public", () => {
    expect(isPublicCatalogTrack({
      id: "real-track",
      title: "Test of Time",
      artist: "Independent Artist",
    })).toBe(true);
  });
});

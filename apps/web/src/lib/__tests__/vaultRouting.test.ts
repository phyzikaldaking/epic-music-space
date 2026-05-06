import { describe, it, expect } from "vitest";
import { decideVaultEntry } from "../vaultRouting";

describe("decideVaultEntry — every branch lands on a working destination", () => {
  it("logged-out viewer chains through signup → setup → upload, legacy preserved", () => {
    const decision = decideVaultEntry({ signedIn: false });
    expect(decision.branch).toBe("logged-out");
    expect(decision.redirectTo).toMatch(/^\/auth\/signup/);
    expect(decision.redirectTo).toContain("role=ARTIST");
    // The deepest target — studio/new?legacy=1&from=vault — must survive
    // double encoding through callbackUrl → next.
    expect(decodeURIComponent(decodeURIComponent(decision.redirectTo))).toContain(
      "/studio/new?legacy=1&from=vault",
    );
  });

  it("logged-in LISTENER routes to the artist signup chain (never home)", () => {
    const decision = decideVaultEntry({
      signedIn: true,
      role: "LISTENER",
      hasStudio: false,
    });
    expect(decision.branch).toBe("needs-artist-role");
    expect(decision.redirectTo).toMatch(/^\/auth\/signup/);
    expect(decision.redirectTo).toContain("role=ARTIST");
  });

  it("logged-in PRODUCER (non-artist) routes to artist signup chain", () => {
    const decision = decideVaultEntry({
      signedIn: true,
      role: "PRODUCER",
      hasStudio: false,
    });
    expect(decision.branch).toBe("needs-artist-role");
    expect(decision.redirectTo).toMatch(/^\/auth\/signup/);
  });

  it("artist without a studio is sent to studio setup with the upload as `next`", () => {
    const decision = decideVaultEntry({
      signedIn: true,
      role: "ARTIST",
      hasStudio: false,
    });
    expect(decision.branch).toBe("needs-studio");
    expect(decision.redirectTo).toMatch(/^\/studio\/setup/);
    expect(decision.redirectTo).toContain("next=");
    expect(decodeURIComponent(decision.redirectTo)).toContain(
      "/studio/new?legacy=1&from=vault",
    );
  });

  it("artist with a studio goes straight to the legacy upload form", () => {
    const decision = decideVaultEntry({
      signedIn: true,
      role: "ARTIST",
      hasStudio: true,
    });
    expect(decision.branch).toBe("go-to-upload");
    expect(decision.redirectTo).toBe("/studio/new?legacy=1&from=vault");
  });

  it("LABEL with a studio routes straight to upload (artist-equivalent)", () => {
    const decision = decideVaultEntry({
      signedIn: true,
      role: "LABEL",
      hasStudio: true,
    });
    expect(decision.branch).toBe("go-to-upload");
    expect(decision.redirectTo).toBe("/studio/new?legacy=1&from=vault");
  });

  it("ADMIN with a studio routes straight to upload (artist-equivalent)", () => {
    const decision = decideVaultEntry({
      signedIn: true,
      role: "ADMIN",
      hasStudio: true,
    });
    expect(decision.branch).toBe("go-to-upload");
  });

  it("never returns the home page as a destination — the bug we're locking out", () => {
    const cases: Parameters<typeof decideVaultEntry>[0][] = [
      { signedIn: false },
      { signedIn: true, role: "LISTENER", hasStudio: false },
      { signedIn: true, role: "ARTIST", hasStudio: false },
      { signedIn: true, role: "ARTIST", hasStudio: true },
      { signedIn: true, role: "LABEL", hasStudio: true },
      { signedIn: true, role: "PRODUCER", hasStudio: false },
    ];
    for (const c of cases) {
      const decision = decideVaultEntry(c);
      expect(decision.redirectTo).not.toBe("/");
      expect(decision.redirectTo.startsWith("/")).toBe(true);
    }
  });

  it("every branch preserves the legacy=1 flag end-to-end", () => {
    const cases: Parameters<typeof decideVaultEntry>[0][] = [
      { signedIn: false },
      { signedIn: true, role: "LISTENER", hasStudio: false },
      { signedIn: true, role: "ARTIST", hasStudio: false },
      { signedIn: true, role: "ARTIST", hasStudio: true },
    ];
    for (const c of cases) {
      const decision = decideVaultEntry(c);
      // Walk through any number of URL-decode passes until we hit the
      // raw target. Up to 3 decodes is enough for the deepest chain
      // (callbackUrl → next → final).
      let url = decision.redirectTo;
      for (let i = 0; i < 4; i += 1) url = decodeURIComponent(url);
      expect(url).toContain("legacy=1");
      expect(url).toContain("from=vault");
    }
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());
const source = (path: string) => readFileSync(resolve(webRoot, path), "utf8");

describe("current Studio entry contract", () => {
  it("sends the legacy /studio entry to the current Pro Tools workspace", () => {
    const page = source("src/app/studio/page.tsx");
    expect(page).toContain('redirect("/studio/try")');
    expect(page).not.toContain("StudioClientBoundary");
  });

  it("sends legacy mixer and export aliases to current Studio modes", () => {
    expect(source("src/app/studio/mixer/page.tsx")).toContain('redirect("/studio/try?mode=mix")');
    expect(source("src/app/studio/mix/page.tsx")).toContain('redirect("/studio/try?mode=mix")');
    expect(source("src/app/studio/export/page.tsx")).toContain('redirect("/studio/try?mode=publish")');
    expect(source("src/app/studio/files/page.tsx")).toContain('redirect("/studio/try")');
  });

  it("uses the current Studio route from signed-in navigation", () => {
    const navbar = source("src/components/NavbarAuth.tsx");
    expect(navbar).toContain('href="/studio/try"');
    expect(navbar).not.toContain('href="/studio"');
  });

  it("exposes the Music Consultant in the primary menu", () => {
    const menu = source("src/components/navigation/EmsMainMenu.tsx");
    expect(menu).toContain('{ href: "/music-consultant", label: "Consultant" }');
  });
});

describe("Studio sound playback contract", () => {
  it("keeps the public sound catalog available without a login gate", () => {
    const route = source("src/app/api/studio/sounds/library/route.ts");
    expect(route).not.toContain('error: "Unauthorized"');
    expect(route).not.toContain("await auth()");
  });

  it("resumes a browser-blocked audio context before preview playback", () => {
    const panel = source("src/components/daw/SampleLibraryPanel.tsx");
    expect(panel).toContain('if (ctx.state === "suspended") await ctx.resume();');
  });
});

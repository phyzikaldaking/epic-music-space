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

    const studioTopBar = source("src/components/daw/StudioTopBar.tsx");
    expect(studioTopBar).toContain('href="/music-consultant"');
    expect(studioTopBar).toContain("Consultant");
  });
  it("boots directly into the Pro workspace and honors every Studio mode route", () => {
    const workspace = source("src/components/daw/DawWorkspace.tsx");
    expect(workspace).toContain("setSnapshot(engine.getSnapshot());");
    expect(workspace).toContain('className={`${proMode ? "hidden" : ""}');

    const client = source("src/app/studio/try/StudioTryClient.tsx");
    expect(client).toContain('requestedMode === "mix"');
    expect(client).toContain('requestedMode === "sounds"');

    const topBar = source("src/components/daw/StudioTopBar.tsx");
    expect(topBar).toContain('{ id: "sounds", label: "Sounds"');
  });
});

describe("Studio sound playback contract", () => {
  it("keeps public sounds available to guests without exposing the restricted bucket", () => {
    const route = source("src/app/api/studio/sounds/library/route.ts");
    expect(route).not.toContain('error: "Unauthorized"');
    expect(route).toContain('const PUBLIC_AUDIO_BUCKETS = ["audio-assets", "studio-kits"] as const;');
    expect(route).toContain("const buckets = session?.user?.id ? AUDIO_BUCKETS : PUBLIC_AUDIO_BUCKETS;");
  });

  it("resumes a browser-blocked audio context before preview playback", () => {
    const panel = source("src/components/daw/SampleLibraryPanel.tsx");
    expect(panel).toContain('if (ctx.state === "suspended") await ctx.resume();');
    expect(panel).toContain("await previewSample(s);");
  });
});

describe("Studio edit workspace contract", () => {
  it("keeps the timeline full-width with compact controls and a collapsed inspector", () => {
    const workspace = source("src/components/daw/DawWorkspace.tsx");
    const lane = source("src/components/daw/EditWindowTrackLane.tsx");
    expect(workspace).toContain("data-studio-timeline-workspace");
    expect(lane).toContain("data-compact-track-controls");
    expect(workspace).toContain("data-studio-inspector-collapsed");
    expect(workspace).not.toContain("Load audio to inspect track data");
    expect(workspace).not.toContain('max-w-[1400px]');
  });

  it("exposes session-safe Studio, Beat Machine, and Mix Room navigation", () => {
    const topBar = source("src/components/daw/StudioTopBar.tsx");
    expect(topBar).toContain('label: "Return to Studio"');
    expect(topBar).toContain('label: "Beat Machine"');
    expect(topBar).toContain('label: "Mix Room"');
  });

  it("puts zoom and snap beside the shared transport", () => {
    const topBar = source("src/components/daw/StudioTopBar.tsx");
    expect(topBar).toContain("timelineZoom");
    expect(topBar).toContain("snapEnabled");
    expect(topBar).toContain('aria-label="Timeline zoom"');
    expect(topBar).toContain('aria-label="Toggle timeline snap"');
  });

  it("renders Beat Machine output as a visible Edit timeline clip", () => {
    const lane = source("src/components/daw/EditWindowTrackLane.tsx");
    expect(lane).toContain("data-timeline-clip");
    expect(lane).toContain("Beat Machine Pattern");
  });

  it("publishes a unique build marker for live deployment verification", () => {
    const config = source("next.config.mjs");
    expect(config).toContain('value: "unified-song-workflow-v4"');
  });
});

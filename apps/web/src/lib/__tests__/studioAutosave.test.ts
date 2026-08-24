import { describe, expect, it } from "vitest";
import { createAutosaveScheduler, projectSaveFingerprint } from "@/app/studio/try/studio/autosave";

const project = { id: "project-1", title: "Song", bpm: 120, sampleRate: 48_000, updatedAt: "ignored", tracks: [], snapshots: [] };

describe("Studio meaningful-change autosave", () => {
  it("excludes transient playback and meter state from save fingerprints", () => {
    expect(projectSaveFingerprint({ ...project, playhead: 1, meterPeak: .9 })).toBe(projectSaveFingerprint({ ...project, playhead: 55, meterPeak: .1 }));
    expect(projectSaveFingerprint({ ...project, title: "New title" })).not.toBe(projectSaveFingerprint(project));
  });

  it("writes local recovery immediately and throttles authenticated cloud checkpoints", async () => {
    let now = 1_000;
    const local: string[] = [];
    const cloud: string[] = [];
    const scheduled: Array<() => void> = [];
    const scheduler = createAutosaveScheduler({
      now: () => now,
      cloudThrottleMs: 5_000,
      authenticated: true,
      online: true,
      writeLocal: async (value) => { local.push(value.title); },
      writeCloud: async (value) => { cloud.push(value.title); },
      schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
      cancelSchedule: () => {},
    });

    await scheduler.notify(project);
    await scheduler.notify({ ...project, title: "Second" });
    expect(local).toEqual(["Song", "Second"]);
    expect(cloud).toEqual(["Song"]);
    now = 6_000;
    await scheduled[0]();
    expect(cloud).toEqual(["Song", "Second"]);
  });

  it("keeps offline changes pending and flushes them when connectivity returns", async () => {
    const cloud: string[] = [];
    const scheduler = createAutosaveScheduler({
      now: () => 10_000,
      authenticated: true,
      online: false,
      writeLocal: async () => {},
      writeCloud: async (value) => { cloud.push(value.title); },
    });
    await scheduler.notify(project);
    expect(cloud).toEqual([]);
    scheduler.setOnline(true);
    await scheduler.flush();
    expect(cloud).toEqual(["Song"]);
    scheduler.dispose();
  });
  it("flushes the latest pending cloud checkpoint when connectivity returns", async () => {
    const cloud: string[] = [];
    const scheduler = createAutosaveScheduler({
      now: () => 10_000,
      authenticated: true,
      online: false,
      writeLocal: async () => {},
      writeCloud: async (value) => { cloud.push(value.title); },
    });
    await scheduler.notify(project);
    scheduler.setOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cloud).toEqual(["Song"]);
    scheduler.dispose();
  });

});

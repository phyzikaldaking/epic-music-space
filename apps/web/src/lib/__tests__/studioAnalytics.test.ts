import { describe, expect, it } from "vitest";
import { buildStudioAnalyticsEvent } from "@/app/studio/try/studio/analytics";

describe("Studio analytics privacy", () => {
  it("keeps approved categories and removes creative content", () => {
    const event = buildStudioAnalyticsEvent("finish", { mode:"creator", category:"true-peak", title:"Secret Song", filename:"master.wav", projectId:"private-id" });
    expect(event).toEqual({ event:"studio_finish", mode:"creator", category:"true-peak" });
    expect(JSON.stringify(event)).not.toContain("Secret Song");
    expect(JSON.stringify(event)).not.toContain("private-id");
  });
});

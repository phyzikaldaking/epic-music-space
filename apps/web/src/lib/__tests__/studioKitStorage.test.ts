import { describe, expect, it } from "vitest";
import { authorizeKitUpload, buildDurableKitManifest } from "@/app/studio/try/studio/kitStorage";

describe("Studio durable user kits", () => {
  it("enforces ownership and quota before upload", () => {
    expect(authorizeKitUpload({ ownerId: "u1", actorId: "u2", usedBytes: 0, quotaBytes: 100, incomingBytes: 10 })).toMatchObject({ allowed: false, reason: "owner" });
    expect(authorizeKitUpload({ ownerId: "u1", actorId: "u1", usedBytes: 95, quotaBytes: 100, incomingBytes: 10 })).toMatchObject({ allowed: false, reason: "quota", remainingBytes: 5 });
    expect(authorizeKitUpload({ ownerId: "u1", actorId: "u1", usedBytes: 50, quotaBytes: 100, incomingBytes: 10 })).toMatchObject({ allowed: true, remainingBytes: 40 });
  });

  it("creates an owner-bound manifest containing durable source references", () => {
    expect(buildDurableKitManifest({ id: "kit-1", ownerId: "u1", name: "My Kit", samples: [{ id: "kick", sourceId: "source-kick", storageUrl: "https://cdn/kick.wav", sizeBytes: 10 }] })).toMatchObject({ schemaVersion: 1, ownerId: "u1", samples: [{ sourceId: "source-kick", durable: true }] });
  });
});

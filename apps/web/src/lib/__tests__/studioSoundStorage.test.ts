import { describe, expect, it } from "vitest";
import { listAudioObjects } from "@/lib/studioSoundStorage";

describe("Studio sound storage", () => {
  it("recursively lists audio files through the supported Storage API", async () => {
    const directories: Record<string, Array<{ id: string | null; name: string; metadata?: { mimetype?: string } }>> = {
      "": [
        { id: null, name: "drums" },
        { id: "root-audio", name: "intro.wav", metadata: { mimetype: "audio/wav" } },
      ],
      drums: [
        { id: "kick", name: "kick.wav", metadata: { mimetype: "audio/wav" } },
        { id: "cover", name: "cover.png", metadata: { mimetype: "image/png" } },
      ],
    };
    const listedPaths: string[] = [];
    const bucket = {
      list: async (path: string) => {
        listedPaths.push(path);
        return { data: directories[path] ?? [], error: null };
      },
    };

    const sounds = await listAudioObjects(bucket, 100);

    expect(listedPaths).toEqual(["", "drums"]);
    expect(sounds.map((sound) => sound.path)).toEqual(["intro.wav", "drums/kick.wav"]);
  });
});

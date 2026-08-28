import { describe, expect, it } from "vitest";
import { listAudioObjects, resolveStudioStorageReadKey } from "@/lib/studioSoundStorage";

describe("Studio sound storage", () => {
  it("uses the public read key instead of a server write credential", () => {
    expect(resolveStudioStorageReadKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-read", SUPABASE_SERVICE_ROLE_KEY: "invalid-jws" })).toBe("public-read");
    expect(resolveStudioStorageReadKey({ SUPABASE_SERVICE_ROLE_KEY: "invalid-jws" })).toBeNull();
  });

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
    const listCalls: Array<{ path: string; limit?: number }> = [];
    const bucket = {
      list: async (path: string, options?: { limit?: number }) => {
        listCalls.push({ path, limit: options?.limit });
        return { data: directories[path] ?? [], error: null };
      },
    };

    const sounds = await listAudioObjects(bucket, 100);

    expect(listCalls).toEqual([{ path: "", limit: 100 }, { path: "drums", limit: 100 }]);
    expect(sounds.map((sound) => sound.path)).toEqual(["intro.wav", "drums/kick.wav"]);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  buildRecordingConstraints,
  listRecordingDevices,
  measureLatencyProfile,
  resolvePreferredDevice,
  watchDeviceChanges,
} from "@/app/studio/try/studio/recordingDevices";

const devices = [
  { deviceId: "default", groupId: "g1", kind: "audioinput", label: "Default microphone" },
  { deviceId: "mic-2", groupId: "g2", kind: "audioinput", label: "Scarlett Input" },
  { deviceId: "speaker-1", groupId: "g3", kind: "audiooutput", label: "Studio Monitors" },
  { deviceId: "camera-1", groupId: "g4", kind: "videoinput", label: "Camera" },
] as MediaDeviceInfo[];

describe("Studio recording devices", () => {
  it("returns audio devices only with stable fallback labels", async () => {
    const result = await listRecordingDevices({ enumerateDevices: async () => devices } as Pick<MediaDevices, "enumerateDevices">);
    expect(result).toEqual({
      inputs: [
        { id: "default", groupId: "g1", label: "Default microphone", isDefault: true },
        { id: "mic-2", groupId: "g2", label: "Scarlett Input", isDefault: false },
      ],
      outputs: [{ id: "speaker-1", groupId: "g3", label: "Studio Monitors", isDefault: false }],
      canSelectOutput: true,
    });
  });

  it("falls back from a missing preference without losing channel configuration", () => {
    expect(resolvePreferredDevice({ inputDeviceId: "gone", outputDeviceId: "gone-too", channelCount: 2 }, {
      inputs: [{ id: "mic-2", groupId: "g2", label: "Scarlett Input", isDefault: false }],
      outputs: [{ id: "speaker-1", groupId: "g3", label: "Studio Monitors", isDefault: false }],
      canSelectOutput: true,
    })).toEqual({ inputDeviceId: "mic-2", outputDeviceId: "speaker-1", channelCount: 2 });
  });

  it("combines context and input-track latency into a measured profile", () => {
    expect(measureLatencyProfile({ baseLatency: .006, outputLatency: .012 }, { latency: .018 }, "2026-08-22T00:00:00.000Z")).toEqual({
      inputMs: 18,
      outputMs: 12,
      baseMs: 6,
      measuredAt: "2026-08-22T00:00:00.000Z",
    });
  });

  it("removes the exact device-change listener during cleanup", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const callback = vi.fn();
    const stop = watchDeviceChanges({ addEventListener, removeEventListener } as unknown as Pick<MediaDevices, "addEventListener" | "removeEventListener">, callback);
    expect(addEventListener).toHaveBeenCalledWith("devicechange", callback);
    stop();
    expect(removeEventListener).toHaveBeenCalledWith("devicechange", callback);
  });

  it("requests the selected clean input and channel count without browser processing", () => {
    expect(buildRecordingConstraints({ inputDeviceId: "mic-2", outputDeviceId: "speaker-1", channelCount: 2 })).toEqual({
      audio: {
        deviceId: { exact: "mic-2" },
        channelCount: { ideal: 2 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  });
});

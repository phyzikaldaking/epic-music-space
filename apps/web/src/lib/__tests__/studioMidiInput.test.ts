import { describe, expect, it } from "vitest";
import { captureMidiMessage, selectMidiInput } from "@/app/studio/try/studio/midiInput";

describe("Studio Web MIDI capture", () => {
  it("selects only a connected input", () => {
    const devices = [{ id: "keys", name: "Keys" }, { id: "pads", name: "Pads" }];
    expect(selectMidiInput(devices, "pads")).toBe("pads");
    expect(selectMidiInput(devices, "missing")).toBeNull();
  });

  it("captures timestamped note, channel, and normalized velocity", () => {
    expect(captureMidiMessage([0x92, 64, 100], { deviceId: "keys", receivedAtMs: 1250, recordingStartedAtMs: 1000 })).toEqual({ type: "note_on", note: 64, velocity: 100 / 127, channel: 3, deviceId: "keys", timestampMs: 250 });
    expect(captureMidiMessage([0x82, 64, 0], { deviceId: "keys", receivedAtMs: 1300, recordingStartedAtMs: 1000 })).toMatchObject({ type: "note_off", timestampMs: 300 });
  });

  it("ignores malformed and non-note messages", () => {
    expect(captureMidiMessage([1], { deviceId: "x", receivedAtMs: 0, recordingStartedAtMs: 0 })).toBeNull();
    expect(captureMidiMessage([0xb0, 1, 2], { deviceId: "x", receivedAtMs: 0, recordingStartedAtMs: 0 })).toBeNull();
  });
});

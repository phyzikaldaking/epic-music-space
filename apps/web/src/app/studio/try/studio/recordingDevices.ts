import type { RecordingDeviceSelection, RecordingLatencyProfile } from "./recording";

export type RecordingDevice = {
  id: string;
  groupId: string;
  label: string;
  isDefault: boolean;
};

export type RecordingDeviceInventory = {
  inputs: RecordingDevice[];
  outputs: RecordingDevice[];
  canSelectOutput: boolean;
};

function toRecordingDevice(device: MediaDeviceInfo, index: number): RecordingDevice {
  const input = device.kind === "audioinput";
  return {
    id: device.deviceId,
    groupId: device.groupId,
    label: device.label || `${input ? "Microphone" : "Output"} ${index + 1}`,
    isDefault: device.deviceId === "default",
  };
}

export async function listRecordingDevices(mediaDevices: Pick<MediaDevices, "enumerateDevices">): Promise<RecordingDeviceInventory> {
  const devices = await mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === "audioinput").map(toRecordingDevice);
  const outputs = devices.filter((device) => device.kind === "audiooutput").map(toRecordingDevice);
  return { inputs, outputs, canSelectOutput: outputs.length > 0 };
}

export function resolvePreferredDevice(preference: RecordingDeviceSelection | undefined, inventory: RecordingDeviceInventory): RecordingDeviceSelection {
  const inputDeviceId = inventory.inputs.some((device) => device.id === preference?.inputDeviceId)
    ? preference!.inputDeviceId
    : (inventory.inputs.find((device) => device.isDefault) ?? inventory.inputs[0])?.id ?? "default";
  const outputDeviceId = inventory.outputs.some((device) => device.id === preference?.outputDeviceId)
    ? preference?.outputDeviceId
    : (inventory.outputs.find((device) => device.isDefault) ?? inventory.outputs[0])?.id;
  return { inputDeviceId, outputDeviceId, channelCount: preference?.channelCount === 2 ? 2 : 1 };
}

export function buildRecordingConstraints(selection: RecordingDeviceSelection): MediaStreamConstraints {
  return {
    audio: {
      deviceId: selection.inputDeviceId && selection.inputDeviceId !== "default" ? { exact: selection.inputDeviceId } : undefined,
      channelCount: { ideal: selection.channelCount },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  };
}

export function measureLatencyProfile(
  context: Pick<AudioContext, "baseLatency" | "outputLatency">,
  trackSettings: { latency?: number },
  measuredAt = new Date().toISOString(),
): RecordingLatencyProfile {
  const milliseconds = (seconds: number | undefined) => Number(((seconds ?? 0) * 1000).toFixed(3));
  return {
    inputMs: milliseconds(trackSettings.latency),
    outputMs: milliseconds(context.outputLatency),
    baseMs: milliseconds(context.baseLatency),
    measuredAt,
  };
}

export function watchDeviceChanges(
  mediaDevices: Pick<MediaDevices, "addEventListener" | "removeEventListener">,
  callback: () => void,
) {
  mediaDevices.addEventListener("devicechange", callback);
  return () => mediaDevices.removeEventListener("devicechange", callback);
}

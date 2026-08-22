export type StudioMidiCapture = { type: "note_on" | "note_off"; note: number; velocity: number; channel: number; deviceId: string; timestampMs: number };

export function selectMidiInput(devices: Array<{ id: string }>, requestedId: string) {
  return devices.some((device) => device.id === requestedId) ? requestedId : null;
}

export function captureMidiMessage(data: ArrayLike<number>, timing: { deviceId: string; receivedAtMs: number; recordingStartedAtMs: number }): StudioMidiCapture | null {
  if (data.length < 3) return null;
  const status = data[0] ?? 0;
  const command = status & 0xf0;
  const velocityByte = data[2] ?? 0;
  if (command !== 0x80 && command !== 0x90) return null;
  return {
    type: command === 0x80 || velocityByte === 0 ? "note_off" : "note_on",
    note: Math.max(0, Math.min(127, data[1] ?? 0)),
    velocity: Math.max(0, Math.min(1, velocityByte / 127)),
    channel: (status & 0x0f) + 1,
    deviceId: timing.deviceId,
    timestampMs: Math.max(0, timing.receivedAtMs - timing.recordingStartedAtMs),
  };
}

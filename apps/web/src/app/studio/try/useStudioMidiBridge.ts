"use client";

import { useCallback, useEffect, useState } from "react";

type MidiStatus = "unsupported" | "idle" | "requesting" | "ready" | "error";

type MidiAccessLike = {
  inputs: Map<string, { id: string; name?: string; onmidimessage: ((event: { data: Uint8Array | number[] }) => void) | null }>;
};

export function useStudioMidiBridge(sessionId = "ems-main-session") {
  const [status, setStatus] = useState<MidiStatus>("idle");
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  const sendMidiEvent = useCallback(async (payload: Record<string, unknown>) => {
    await fetch("/api/studio/midi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, ...payload }) }).catch(() => undefined);
  }, [sessionId]);

  const connect = useCallback(async () => {
    const requestMIDIAccess = (navigator as Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> }).requestMIDIAccess;
    if (!requestMIDIAccess) { setStatus("unsupported"); return; }
    setStatus("requesting");
    try {
      const access = await requestMIDIAccess();
      const nextDevices = Array.from(access.inputs.values()).map((input) => ({ id: input.id, name: input.name ?? "MIDI Input" }));
      setDevices(nextDevices);
      access.inputs.forEach((input) => {
        input.onmidimessage = (event) => {
          const [statusByte, data1, data2] = Array.from(event.data);
          const command = statusByte & 0xf0;
          const channel = (statusByte & 0x0f) + 1;
          const type = command === 0x90 && data2 > 0 ? "note_on" : command === 0x80 || (command === 0x90 && data2 === 0) ? "note_off" : command === 0xb0 ? "cc" : "transport";
          const payload = type === "cc" ? { type, controller: data1, value: data2 / 127, channel, deviceId: input.id } : { type, note: data1, velocity: data2 / 127, channel, deviceId: input.id };
          setLastEvent(`${type} ch${channel} ${data1}`);
          void sendMidiEvent(payload);
        };
      });
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [sendMidiEvent]);

  useEffect(() => { return () => setDevices([]); }, []);

  return { status, devices, lastEvent, connect };
}

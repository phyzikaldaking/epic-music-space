"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureMidiMessage, selectMidiInput } from "./studio/midiInput";

type MidiStatus = "unsupported" | "idle" | "requesting" | "ready" | "error";

type MidiMessageLike = { data: Uint8Array | number[] | null };
type MidiInputLike = { id: string; name?: string; onmidimessage: ((event: MidiMessageLike) => void) | null };
type MidiAccessLike = { inputs: Map<string, MidiInputLike> };

function readMidiBytes(data: MidiMessageLike["data"]) {
  if (!data) return null;
  const bytes = Array.from(data);
  if (bytes.length < 3) return null;
  const [statusByte = 0, data1 = 0, data2 = 0] = bytes;
  return { statusByte, data1, data2 };
}

export function useStudioMidiBridge(sessionId = "ems-main-session") {
  const [status, setStatus] = useState<MidiStatus>("idle");
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);
  const selectedDeviceRef = useRef<string | null>(null);
  const captureStartedAt = useRef(0);

  const setSelectedDeviceId = useCallback((id: string) => {
    const selected = selectMidiInput(devices, id);
    selectedDeviceRef.current = selected;
    setSelectedDeviceIdState(selected);
  }, [devices]);

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
      selectedDeviceRef.current = nextDevices[0]?.id ?? null;
      setSelectedDeviceIdState(nextDevices[0]?.id ?? null);
      captureStartedAt.current = performance.now();
      access.inputs.forEach((input) => {
        input.onmidimessage = (event) => {
          if (selectedDeviceRef.current !== input.id) return;
          const bytes = readMidiBytes(event.data);
          if (!bytes) return;
          const { statusByte, data1, data2 } = bytes;
          const command = statusByte & 0xf0;
          const channel = (statusByte & 0x0f) + 1;
          const type = command === 0x90 && data2 > 0 ? "note_on" : command === 0x80 || (command === 0x90 && data2 === 0) ? "note_off" : command === 0xb0 ? "cc" : "transport";
          const captured = captureMidiMessage([statusByte, data1, data2], { deviceId: input.id, receivedAtMs: performance.now(), recordingStartedAtMs: captureStartedAt.current });
          const payload = type === "cc" ? { type, controller: data1, value: data2 / 127, channel, deviceId: input.id, timestampMs: performance.now() - captureStartedAt.current } : captured ?? { type, note: data1, velocity: data2 / 127, channel, deviceId: input.id };
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

  return { status, devices, selectedDeviceId, setSelectedDeviceId, lastEvent, connect };
}

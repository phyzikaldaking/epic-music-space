"use client";

import { useEffect, useRef } from "react";

interface MidiNoteEvent {
  trackId: string;
  note: number;
  velocity: number;
  time: number;
}

/** Hook to handle Web MIDI input. Listens for noteon/noteoff and optionally
 *  calls a handler for each event. Call with onNote = undefined to just
 *  manage MIDI permission state silently. */
export function useMidiInput(onNote?: (event: MidiNoteEvent) => void) {
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const inputsRef = useRef<Map<string, MIDIInput>>(new Map());

  useEffect(() => {
    let isMounted = true;

    async function initMidi() {
      if (!navigator.requestMIDIAccess) {
        // Browser doesn't support Web MIDI (Safari, Firefox, etc.)
        return;
      }

      try {
        const midiAccess = await navigator.requestMIDIAccess();
        if (!isMounted) return;

        midiAccessRef.current = midiAccess;

        // Connect all inputs immediately
        const inputs = midiAccess.inputs;
        for (const input of inputs.values()) {
          attachMidiInput(input);
        }

        // Listen for hot-swap (USB MIDI controller plugged/unplugged)
        midiAccess.addEventListener("statechange", (e) => {
          const input = e.port as MIDIInput;
          if (input.type === "input") {
            if (input.state === "connected") {
              attachMidiInput(input);
            } else if (input.state === "disconnected") {
              inputsRef.current.delete(input.id);
            }
          }
        });
      } catch (err) {
        // User denied permission or browser error — silently degrade
        // to fallback (keyboard piano, etc.)
      }
    }

    function attachMidiInput(input: MIDIInput) {
      inputsRef.current.set(input.id, input);
      input.addEventListener("midimessage", (e) => {
        const msg = e.data;
        if (!msg || msg.length < 3) return;

        const status = msg[0] & 0xf0;
        const note = msg[1];
        const velocity = msg[2];

        // MIDI status bytes: 0x90 = noteon, 0x80 = noteoff
        if (status === 0x90 || status === 0x80) {
          onNote?.({
            trackId: input.id,
            note,
            velocity: status === 0x90 ? velocity : 0,
            time: (e as unknown).timeStamp ?? Date.now(),
          });
        }
      });
    }

    initMidi();

    return () => {
      isMounted = false;
      // Cleanup: remove listeners from all inputs
      for (const input of inputsRef.current.values()) {
        input.removeEventListener("midimessage", () => {});
      }
      inputsRef.current.clear();
    };
  }, [onNote]);

  return {
    connected: inputsRef.current.size > 0,
    inputs: Array.from(inputsRef.current.values()),
  };
}

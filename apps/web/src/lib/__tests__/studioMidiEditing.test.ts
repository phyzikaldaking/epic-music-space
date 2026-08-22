import { describe, expect, it } from "vitest";
import { createMidiNote, deleteMidiNotes, editNoteVelocity, moveMidiNotes, patchMidiNoteExpression, rampNoteVelocities, resizeMidiNotes, selectMidiNotes, type StudioMidiNote } from "@/app/studio/try/studio/midiEditing";

const notes: StudioMidiNote[] = [
  { id: "a", note: 60, velocity: .8, startTick: 0, durationTicks: 480, channel: 1, probability: 1, pan: 0, timingOffsetTicks: 0 },
  { id: "b", note: 64, velocity: .7, startTick: 480, durationTicks: 480, channel: 1, probability: 1, pan: 0, timingOffsetTicks: 0 },
];

describe("Studio MIDI editing", () => {
  it("creates and toggles multi-selection", () => {
    expect(createMidiNote({ id: "c", note: 200, startTick: -2, durationTicks: 0 })).toMatchObject({ note: 127, startTick: 0, durationTicks: 1 });
    expect(selectMidiNotes(new Set(["a"]), "b", true)).toEqual(new Set(["a", "b"]));
    expect(selectMidiNotes(new Set(["a"]), "b", false)).toEqual(new Set(["b"]));
  });

  it("moves and resizes every selected note as a group", () => {
    const selected = new Set(["a", "b"]);
    expect(moveMidiNotes(notes, selected, { tickDelta: 120, noteDelta: -12 }).map((note) => [note.note, note.startTick])).toEqual([[48, 120], [52, 600]]);
    expect(resizeMidiNotes(notes, selected, -600).map((note) => note.durationTicks)).toEqual([1, 1]);
  });

  it("deletes only selected notes and returns undo state", () => {
    const command = deleteMidiNotes(notes, new Set(["a"]));
    expect(command.after.map((note) => note.id)).toEqual(["b"]);
    expect(command.undo).toEqual(notes);
  });

  it("edits individual velocity and draws a ramp across selected notes", () => {
    expect(editNoteVelocity(notes, "a", .25)[0].velocity).toBe(.25);
    expect(rampNoteVelocities(notes, new Set(["a", "b"]), .2, 1).map((note) => note.velocity)).toEqual([.2, 1]);
    expect(rampNoteVelocities([notes[0]], new Set(["a"]), .4, .9)[0].velocity).toBe(.4);
  });

  it("edits channel, probability, pan, timing offset, and duration with bounds", () => {
    expect(patchMidiNoteExpression(notes, "a", { channel: 17, probability: -.2, pan: 2, timingOffsetTicks: -14, durationTicks: 960 })[0]).toMatchObject({ channel: 16, probability: 0, pan: 1, timingOffsetTicks: -14, durationTicks: 960 });
  });
});

export type StudioMidiNote = {
  id: string;
  note: number;
  velocity: number;
  startTick: number;
  durationTicks: number;
  channel: number;
  probability: number;
  pan: number;
  timingOffsetTicks: number;
};

export function createMidiNote(input: Pick<StudioMidiNote, "id" | "note" | "startTick" | "durationTicks"> & Partial<StudioMidiNote>): StudioMidiNote {
  return {
    id: input.id,
    note: Math.max(0, Math.min(127, Math.round(input.note))),
    velocity: Math.max(.01, Math.min(1, input.velocity ?? .8)),
    startTick: Math.max(0, Math.round(input.startTick)),
    durationTicks: Math.max(1, Math.round(input.durationTicks)),
    channel: Math.max(1, Math.min(16, Math.round(input.channel ?? 1))),
    probability: Math.max(0, Math.min(1, input.probability ?? 1)),
    pan: Math.max(-1, Math.min(1, input.pan ?? 0)),
    timingOffsetTicks: Math.round(input.timingOffsetTicks ?? 0),
  };
}

export function selectMidiNotes(selected: ReadonlySet<string>, id: string, additive: boolean) {
  if (!additive) return new Set([id]);
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function moveMidiNotes(notes: StudioMidiNote[], selected: ReadonlySet<string>, delta: { tickDelta: number; noteDelta: number }) {
  return notes.map((note) => selected.has(note.id) ? { ...note, startTick: Math.max(0, note.startTick + Math.round(delta.tickDelta)), note: Math.max(0, Math.min(127, note.note + Math.round(delta.noteDelta))) } : note);
}

export function resizeMidiNotes(notes: StudioMidiNote[], selected: ReadonlySet<string>, durationDeltaTicks: number) {
  return notes.map((note) => selected.has(note.id) ? { ...note, durationTicks: Math.max(1, note.durationTicks + Math.round(durationDeltaTicks)) } : note);
}

export function deleteMidiNotes(notes: StudioMidiNote[], selected: ReadonlySet<string>) {
  return { label: "Delete MIDI notes", before: notes, after: notes.filter((note) => !selected.has(note.id)), undo: notes };
}

function boundedVelocity(value: number) {
  return Number(Math.max(.01, Math.min(1, value)).toFixed(4));
}

export function editNoteVelocity(notes: StudioMidiNote[], id: string, velocity: number) {
  return notes.map((note) => note.id === id ? { ...note, velocity: boundedVelocity(velocity) } : note);
}

export function rampNoteVelocities(notes: StudioMidiNote[], selected: ReadonlySet<string>, startVelocity: number, endVelocity: number) {
  const ordered = notes.filter((note) => selected.has(note.id)).sort((left, right) => left.startTick - right.startTick || left.note - right.note);
  const velocityById = new Map(ordered.map((note, index) => [note.id, boundedVelocity(startVelocity + (endVelocity - startVelocity) * (ordered.length <= 1 ? 0 : index / (ordered.length - 1)))]));
  return notes.map((note) => velocityById.has(note.id) ? { ...note, velocity: velocityById.get(note.id)! } : note);
}

export function patchMidiNoteExpression(notes: StudioMidiNote[], id: string, patch: Partial<Pick<StudioMidiNote, "channel" | "probability" | "pan" | "timingOffsetTicks" | "durationTicks">>) {
  return notes.map((note) => note.id !== id ? note : {
    ...note,
    channel: Math.max(1, Math.min(16, Math.round(patch.channel ?? note.channel))),
    probability: Math.max(0, Math.min(1, patch.probability ?? note.probability)),
    pan: Math.max(-1, Math.min(1, patch.pan ?? note.pan)),
    timingOffsetTicks: Math.round(patch.timingOffsetTicks ?? note.timingOffsetTicks),
    durationTicks: Math.max(1, Math.round(patch.durationTicks ?? note.durationTicks)),
  });
}

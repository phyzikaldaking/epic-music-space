export type InstrumentKind = "sampler" | "drum-rack" | "subtractive-synth" | "keys" | "bass" | "pads" | "orchestral";
export type InstrumentRack = { activeId: InstrumentKind; instruments: Array<{ id: InstrumentKind; kind: InstrumentKind; name: string; polyphony: number }> };

export function createStarterInstrumentRack(): InstrumentRack {
  const instruments: InstrumentRack["instruments"] = [
    { id: "sampler", kind: "sampler", name: "Platinum Sampler", polyphony: 32 },
    { id: "drum-rack", kind: "drum-rack", name: "Beat Rack", polyphony: 32 },
    { id: "subtractive-synth", kind: "subtractive-synth", name: "Neon Analog", polyphony: 16 },
    { id: "keys", kind: "keys", name: "Studio Keys", polyphony: 64 },
    { id: "bass", kind: "bass", name: "Sub Bass", polyphony: 8 },
    { id: "pads", kind: "pads", name: "Atmosphere", polyphony: 32 },
    { id: "orchestral", kind: "orchestral", name: "Starter Orchestra", polyphony: 64 },
  ];
  return { activeId: "sampler", instruments };
}

export function selectRackInstrument(rack: InstrumentRack, id: InstrumentKind) {
  return rack.instruments.some((instrument) => instrument.id === id) ? { ...rack, activeId: id } : rack;
}

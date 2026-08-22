export function arrangeBeatPatterns(patterns: Array<{ patternId: string; name: string; bars: number }>, clock: { beatsPerBar: number; ticksPerBeat: number }) {
  let cursor = 0;
  return patterns.map((pattern, index) => {
    const length = Math.max(1, Math.round(pattern.bars)) * Math.max(1, clock.beatsPerBar) * Math.max(1, clock.ticksPerBeat);
    const section = { id: `section-${pattern.patternId}-${index}`, patternId: pattern.patternId, name: pattern.name, startTick: cursor, endTick: cursor + length };
    cursor += length;
    return section;
  });
}

export function printPatternToStudio(pattern: { id: string; name: string; version: number; durationTicks: number; steps: unknown[] }, render: { clipId: string; startFrame: number; durationFrames: number }) {
  return {
    id: render.clipId,
    name: `${pattern.name} (Printed)`,
    sourceId: `pattern:${pattern.id}:v${pattern.version}`,
    renderedFromId: pattern.id,
    patternVersion: pattern.version,
    startFrame: Math.max(0, Math.round(render.startFrame)),
    durationFrames: Math.max(1, Math.round(render.durationFrames)),
    immutablePatternSnapshot: structuredClone(pattern),
  };
}

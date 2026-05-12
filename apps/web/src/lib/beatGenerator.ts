/**
 * Beat pattern generator: given BPM + genre, creates drum pattern MIDI clips
 */

export interface DrumPattern {
  trackId: string;
  trackName: string;
  notes: Array<{
    note: number;
    velocity: number;
    time: number; // in quarter notes (0-16 for a 4-bar loop)
    duration: number; // in quarter notes
  }>;
  duration: number; // in quarter notes
}

type Genre = "trap" | "house" | "dnb" | "pop";

const DRUM_KITS = {
  trap: {
    kick: 36,
    snare: 38,
    hihat: 42,
    clap: 39,
    tom: 48,
  },
  house: {
    kick: 36,
    snare: 38,
    hihat: 42,
    openhat: 46,
  },
  dnb: {
    kick: 36,
    snare: 38,
    hihat: 42,
    cymbal: 49,
  },
  pop: {
    kick: 36,
    snare: 38,
    hihat: 42,
  },
};

export function generateBeatPattern(
  bpm: number,
  genre: Genre,
  bars: number = 4
): DrumPattern[] {
  const patterns: DrumPattern[] = [];
  const quarterNoteDuration = (60 / bpm) * 1000; // ms per quarter note
  const totalBeats = bars * 4; // 4 beats per bar

  if (genre === "trap") {
    patterns.push(generateTrapKick(totalBeats));
    patterns.push(generateTrapSnare(totalBeats));
    patterns.push(generateTrapHihat(totalBeats));
  } else if (genre === "house") {
    patterns.push(generateHouseKick(totalBeats));
    patterns.push(generateHouseSnare(totalBeats));
    patterns.push(generateHouseHihat(totalBeats));
  } else if (genre === "dnb") {
    patterns.push(generateDNBKick(totalBeats));
    patterns.push(generateDNBSnare(totalBeats));
    patterns.push(generateDNBHihat(totalBeats));
  } else {
    patterns.push(generatePopKick(totalBeats));
    patterns.push(generatePopSnare(totalBeats));
  }

  return patterns;
}

function generateTrapKick(beats: number): DrumPattern {
  const kit = DRUM_KITS.trap;
  const notes = [];

  // Trap: 808 kick on 1, syncopated pattern
  for (let bar = 0; bar < beats / 4; bar++) {
    notes.push({ note: kit.kick, velocity: 100, time: bar * 4, duration: 1 });
    notes.push({ note: kit.kick, velocity: 80, time: bar * 4 + 2.5, duration: 0.5 });
  }

  return {
    trackId: "drum-kick",
    trackName: "Kick",
    notes,
    duration: beats,
  };
}

function generateTrapSnare(beats: number): DrumPattern {
  const kit = DRUM_KITS.trap;
  const notes = [];

  // Trap: snares on 2 and 4, with rolls
  for (let bar = 0; bar < beats / 4; bar++) {
    const barStart = bar * 4;
    // Main snares
    notes.push({ note: kit.snare, velocity: 100, time: barStart + 2, duration: 0.5 });
    notes.push({ note: kit.snare, velocity: 100, time: barStart + 4, duration: 0.5 });
    // Clap rolls on beat 4
    notes.push({ note: kit.clap, velocity: 70, time: barStart + 3.5, duration: 0.25 });
    notes.push({ note: kit.clap, velocity: 70, time: barStart + 3.75, duration: 0.25 });
  }

  return {
    trackId: "drum-snare",
    trackName: "Snare",
    notes,
    duration: beats,
  };
}

function generateTrapHihat(beats: number): DrumPattern {
  const kit = DRUM_KITS.trap;
  const notes = [];

  // Trap: fast hi-hat pattern, muted on snare hits
  for (let beat = 0; beat < beats; beat += 0.5) {
    const isSnareBeat = (beat + 2) % 4 === 0 || (beat + 4) % 4 === 0;
    if (!isSnareBeat) {
      notes.push({ note: kit.hihat, velocity: 60, time: beat, duration: 0.25 });
    }
  }

  return {
    trackId: "drum-hihat",
    trackName: "Hi-Hat",
    notes,
    duration: beats,
  };
}

function generateHouseKick(beats: number): DrumPattern {
  const kit = DRUM_KITS.house;
  const notes = [];

  // House: 4-on-the-floor, every beat
  for (let beat = 0; beat < beats; beat++) {
    notes.push({ note: kit.kick, velocity: 110, time: beat, duration: 0.9 });
  }

  return {
    trackId: "drum-kick",
    trackName: "Kick",
    notes,
    duration: beats,
  };
}

function generateHouseSnare(beats: number): DrumPattern {
  const kit = DRUM_KITS.house;
  const notes = [];

  // House: snares on 2 and 4
  for (let bar = 0; bar < beats / 4; bar++) {
    const barStart = bar * 4;
    notes.push({ note: kit.snare, velocity: 100, time: barStart + 2, duration: 0.8 });
    notes.push({ note: kit.snare, velocity: 100, time: barStart + 4, duration: 0.8 });
  }

  return {
    trackId: "drum-snare",
    trackName: "Snare",
    notes,
    duration: beats,
  };
}

function generateHouseHihat(beats: number): DrumPattern {
  const kit = DRUM_KITS.house;
  const notes = [];

  // House: closed hi-hat on eighths, open on syncopated hits
  for (let beat = 0; beat < beats; beat += 0.5) {
    const isOpen = (beat % 4 === 1.5 || beat % 4 === 3.5);
    notes.push({
      note: isOpen ? kit.openhat : kit.hihat,
      velocity: isOpen ? 70 : 80,
      time: beat,
      duration: 0.4,
    });
  }

  return {
    trackId: "drum-hihat",
    trackName: "Hi-Hat",
    notes,
    duration: beats,
  };
}

function generateDNBKick(beats: number): DrumPattern {
  const kit = DRUM_KITS.dnb;
  const notes = [];

  // DNB: complex kick pattern with syncopation
  for (let bar = 0; bar < beats / 4; bar++) {
    const barStart = bar * 4;
    notes.push({ note: kit.kick, velocity: 110, time: barStart + 0, duration: 0.6 });
    notes.push({ note: kit.kick, velocity: 90, time: barStart + 1.5, duration: 0.5 });
    notes.push({ note: kit.kick, velocity: 100, time: barStart + 2.8, duration: 0.6 });
  }

  return {
    trackId: "drum-kick",
    trackName: "Kick",
    notes,
    duration: beats,
  };
}

function generateDNBSnare(beats: number): DrumPattern {
  const kit = DRUM_KITS.dnb;
  const notes = [];

  // DNB: crisp snares with tight timing
  for (let bar = 0; bar < beats / 4; bar++) {
    const barStart = bar * 4;
    notes.push({ note: kit.snare, velocity: 105, time: barStart + 2, duration: 0.4 });
    notes.push({ note: kit.snare, velocity: 105, time: barStart + 4, duration: 0.4 });
  }

  return {
    trackId: "drum-snare",
    trackName: "Snare",
    notes,
    duration: beats,
  };
}

function generateDNBHihat(beats: number): DrumPattern {
  const kit = DRUM_KITS.dnb;
  const notes = [];

  // DNB: fast breakbeats, dense hi-hat pattern
  for (let beat = 0; beat < beats; beat += 0.25) {
    const velocity = Math.random() > 0.5 ? 80 : 60;
    notes.push({ note: kit.hihat, velocity, time: beat, duration: 0.2 });
  }

  return {
    trackId: "drum-hihat",
    trackName: "Hi-Hat",
    notes,
    duration: beats,
  };
}

function generatePopKick(beats: number): DrumPattern {
  const kit = DRUM_KITS.pop;
  const notes = [];

  // Pop: simple kick on 1 and 3
  for (let bar = 0; bar < beats / 4; bar++) {
    const barStart = bar * 4;
    notes.push({ note: kit.kick, velocity: 100, time: barStart + 0, duration: 0.7 });
    notes.push({ note: kit.kick, velocity: 95, time: barStart + 2.5, duration: 0.7 });
  }

  return {
    trackId: "drum-kick",
    trackName: "Kick",
    notes,
    duration: beats,
  };
}

function generatePopSnare(beats: number): DrumPattern {
  const kit = DRUM_KITS.pop;
  const notes = [];

  // Pop: snares on 2 and 4, with slight swing
  for (let bar = 0; bar < beats / 4; bar++) {
    const barStart = bar * 4;
    notes.push({ note: kit.snare, velocity: 100, time: barStart + 2, duration: 0.6 });
    notes.push({ note: kit.snare, velocity: 100, time: barStart + 4, duration: 0.6 });
  }

  return {
    trackId: "drum-snare",
    trackName: "Snare",
    notes,
    duration: beats,
  };
}

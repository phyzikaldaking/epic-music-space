// Centralized tooltip copy for the EMS Studio.
// Keep entries declarative + "why" oriented. The Studio Coach AI also reads
// this map so users get the same explanations across hover and chat.

export const tooltips = {
  // Transport
  transportPlay: "Start playback from the cursor.",
  transportStop: "Stop playback and return to start.",
  transportRecord:
    "Arm record. Tracks with the red REC dot will capture audio when you press Play.",
  transportSurprise: "Generate a fresh beat idea using current kit + BPM.",
  transportLoop: "Loop the selected region while playing.",
  transportMetronome: "Click track. Useful when recording a take.",
  transportTapTempo: "Tap repeatedly to set BPM by feel.",
  transportBpmHalf: "Halve the BPM (e.g. 140 → 70 for boom-bap feel).",
  transportBpmDouble: "Double the BPM (e.g. 70 → 140 for trap feel).",
  transportBpmInput: "Project tempo in beats per minute.",

  // Beat machine
  beatBank: "Pattern banks. Hold A/B/C/D to write four sections of a song.",
  beatKit: "Drum kit. Trap, drill, afro, hyperpop — same grid, different sound.",
  beatOnOff: "Mute the entire beat machine without losing your pattern.",
  beatClear: "Clear every step in this lane.",
  beatRandomize: "Roll a fresh pattern in this lane.",
  beatFill: "Fill every step in this lane (great for hi-hats).",
  beatShiftLeft: "Shift this lane's pattern one step earlier.",
  beatShiftRight: "Shift this lane's pattern one step later.",
  beatRender: "Bounce the beat to a real audio track so you can mix it.",
  beatSuggest: "Get an AI suggestion for the next bar.",

  // Mixer / TrackStrip
  trackArm: "Arm to record. Press REC + Play to capture into this track.",
  trackMute: "Silence this track without removing it.",
  trackSolo: "Mute every other track. Helpful for hearing this take in isolation.",
  trackFreeze: "Bounce track + effects to audio to free up CPU.",
  trackGain: "Track volume. -∞ silent, 0 dB unity.",
  trackPan: "Place the track left or right in the stereo field.",
  trackEqLow: "Boost or cut bass (around 200 Hz).",
  trackEqMid: "Boost or cut mids (around 1 kHz). Where vocals live.",
  trackEqHigh: "Boost or cut highs (around 5 kHz). Air and presence.",
  trackComp: "Compressor threshold. Lower = more compression.",
  trackReverbSend: "How much of this track goes to the shared reverb.",
  trackDelaySend: "How much of this track goes to the shared delay.",
  trackSidechain: "Duck this track when the kick hits — classic EDM/trap pump.",
  trackImport: "Replace this track's audio with a file from your computer.",
  trackRename: "Rename this track.",

  // Master
  masterLufs:
    "Loudness target. -14 LUFS for streaming (Spotify/YouTube), -9 LUFS for club.",
  masterTruePeak:
    "Maximum peak. Keep below -1 dBTP to avoid distortion on lossy codecs.",
  masterPresetStream: "Streaming master: -14 LUFS, balanced highs.",
  masterPresetClub: "Club master: louder, fatter low end.",
  masterPresetBroadcast: "Broadcast master: -23 LUFS for radio/TV.",
  masterMidSide: "Process the center and the sides separately.",
  masterSpectrum: "Visualize frequency content. Use to spot mud or harshness.",

  // MIDI / Piano
  midiScale: "Scale lock — only notes from this key/scale will play.",
  midiQuantize: "Snap notes to the nearest beat division.",
  midiChord: "Drop a chord progression in this scale.",

  // Upload
  uploadChooseFiles: "Pick one or more audio files. WAV, MP3, FLAC, AIFF, OGG, M4A.",
  uploadChooseFolder: "Pick a kit folder. Each file becomes a track.",

  // Audio settings
  audioSampleRate: "How many samples per second the engine runs at. 48 kHz is the pro standard.",
  audioBitDepth: "Mixes are processed in 32-bit float internally and exported at 24-bit PCM.",
  audioLatency: "Lower = real-time tracking feel. Higher = stable playback.",
} as const;

export type TooltipKey = keyof typeof tooltips;

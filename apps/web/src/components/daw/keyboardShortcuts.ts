/** Single source of truth for studio keyboard shortcuts. The DawWorkspace
 *  onKey handler and the ShortcutOverlay both read from this list so help
 *  copy never drifts from actual behavior. */
export interface ShortcutEntry {
  keys: string[];
  description: string;
  group: "Transport" | "Recording" | "Mix" | "Synth" | "View";
}

export const KEYBOARD_SHORTCUTS: ShortcutEntry[] = [
  // Transport
  { keys: ["Space"], description: "Play / Stop (return to start)", group: "Transport" },
  { keys: ["Home"], description: "Rewind to start", group: "Transport" },
  { keys: ["L"], description: "Toggle loop region", group: "Transport" },
  { keys: ["M"], description: "Toggle metronome", group: "Transport" },
  { keys: ["T"], description: "Tap tempo (tap repeatedly to set BPM)", group: "Transport" },

  // Recording
  { keys: ["R"], description: "Start / stop recording on armed tracks", group: "Recording" },

  // Mix
  { keys: ["⌘", "Z"], description: "Undo last edit (survives reload)", group: "Mix" },
  { keys: ["?"], description: "Show this keyboard shortcut overlay", group: "View" },
  { keys: ["Esc"], description: "Close overlays / cancel current modal", group: "View" },

  // Synth play surface (homerow keyboard piano)
  { keys: ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J"], description: "Play synth (chromatic, like a piano keyboard)", group: "Synth" },
];

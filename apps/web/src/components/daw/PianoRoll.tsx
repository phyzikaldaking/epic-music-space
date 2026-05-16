import { useEffect, useRef, useState, useCallback } from "react";

interface MidiNote {
  note: number;       // 0..127 MIDI note number
  startBeat: number;
  durationBeats: number;
  velocity: number;   // 0..1
}

interface MidiClip {
  notes: MidiNote[];
  lengthBeats: number;
}

interface PianoRollProps {
  clip: MidiClip;
  color: string;
  positionBeats?: number;
  /** Called with the updated notes array whenever the user edits */
  onNotesChange?: (notes: MidiNote[]) => void;
  /** Read-only mode (no editing) */
  readOnly?: boolean;
  beatsPerBar?: number;
}

const NOTE_HEIGHT = 8;   // px per MIDI note row
const BEAT_WIDTH = 48;   // px per beat
const TOTAL_NOTES = 88;  // C1..C8 piano range shown
const NOTE_OFFSET = 21;  // MIDI note 21 = A0, bottom of keyboard

function noteToY(note: number): number {
  return (TOTAL_NOTES - 1 - (note - NOTE_OFFSET)) * NOTE_HEIGHT;
}

function yToNote(y: number): number {
  return Math.round(TOTAL_NOTES - 1 - y / NOTE_HEIGHT) + NOTE_OFFSET;
}

function xToBeat(x: number): number {
  return x / BEAT_WIDTH;
}

function beatToX(beat: number): number {
  return beat * BEAT_WIDTH;
}

export default function PianoRoll({
  clip,
  color,
  positionBeats = 0,
  onNotesChange,
  readOnly = false,
  beatsPerBar = 4,
}: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [notes, setNotes] = useState<MidiNote[]>(clip.notes);
  const [dragNote, setDragNote] = useState<{ idx: number; startX: number; startBeat: number } | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Sync external clip changes
  useEffect(() => { setNotes(clip.notes); }, [clip.notes]);

  const canvasWidth = Math.max(clip.lengthBeats * BEAT_WIDTH, 200);
  const canvasHeight = TOTAL_NOTES * NOTE_HEIGHT;

  // Draw the piano roll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Background
    ctx.fillStyle = "#0f0f1a";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Bar/beat grid lines
    for (let beat = 0; beat <= clip.lengthBeats; beat++) {
      const x = beatToX(beat);
      ctx.strokeStyle = beat % beatsPerBar === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    // Piano key lanes (black keys darker)
    const BLACK_NOTES = new Set([1, 3, 6, 8, 10]); // C#,D#,F#,G#,A# within octave
    for (let n = 0; n < TOTAL_NOTES; n++) {
      const midiNote = n + NOTE_OFFSET;
      const isBlack = BLACK_NOTES.has(midiNote % 12);
      const y = noteToY(midiNote);
      ctx.fillStyle = isBlack ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.02)";
      ctx.fillRect(0, y, canvasWidth, NOTE_HEIGHT);
      // Horizontal lane line
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    // MIDI notes
    notes.forEach((note, idx) => {
      const x = beatToX(note.startBeat);
      const y = noteToY(note.note);
      const w = Math.max(beatToX(note.durationBeats) - 1, 4);
      const isHovered = idx === hoveredIdx;
      const alpha = 0.6 + note.velocity * 0.4;
      ctx.fillStyle = isHovered ? "#fff" : color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, w, NOTE_HEIGHT - 2, 2);
      ctx.fill();
    });
  }, [notes, color, clip.lengthBeats, beatsPerBar, hoveredIdx, canvasWidth, canvasHeight]);

  const findNoteAtPos = useCallback((x: number, y: number): number => {
    const beat = xToBeat(x);
    const note = yToNote(y);
    return notes.findIndex(n =>
      n.note === note &&
      beat >= n.startBeat &&
      beat <= n.startBeat + n.durationBeats
    );
  }, [notes]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.button === 2) {
      // Right-click: delete note
      const idx = findNoteAtPos(x, y);
      if (idx !== -1) {
        const next = notes.filter((_, i) => i !== idx);
        setNotes(next);
        onNotesChange?.(next);
      }
      return;
    }

    const idx = findNoteAtPos(x, y);
    if (idx !== -1) {
      // Start drag on existing note
      setDragNote({ idx, startX: x, startBeat: notes[idx].startBeat });
    } else {
      // Click on empty: add new note (1 beat long, velocity 0.8)
      const newNote: MidiNote = {
        note: yToNote(y),
        startBeat: Math.floor(xToBeat(x) * 4) / 4, // snap to 1/4 beat
        durationBeats: 1,
        velocity: 0.8,
      };
      const next = [...notes, newNote].sort((a, b) => a.startBeat - b.startBeat);
      setNotes(next);
      onNotesChange?.(next);
    }
  }, [readOnly, notes, findNoteAtPos, onNotesChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragNote) {
      const dx = x - dragNote.startX;
      const deltaBeat = Math.floor(xToBeat(dx) * 4) / 4;
      const next = notes.map((n, i) =>
        i === dragNote.idx ? { ...n, startBeat: Math.max(0, dragNote.startBeat + deltaBeat) } : n
      );
      setNotes(next);
    } else {
      setHoveredIdx(findNoteAtPos(x, y));
    }
  }, [dragNote, notes, findNoteAtPos]);

  const handleMouseUp = useCallback(() => {
    if (dragNote) {
      onNotesChange?.(notes);
      setDragNote(null);
    }
  }, [dragNote, notes, onNotesChange]);

  return (
    <div className="relative overflow-auto rounded border border-white/10 bg-[#0f0f1a]" style={{ maxHeight: 300 }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth * (window?.devicePixelRatio || 1)}
        height={canvasHeight * (window?.devicePixelRatio || 1)}
        style={{ width: canvasWidth, height: canvasHeight, cursor: readOnly ? "default" : "crosshair", display: "block" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={e => e.preventDefault()}
      />
      {!readOnly && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white/40">
          Click to add • Right-click to delete • Drag to move
        </div>
      )}
    </div>
  );
}

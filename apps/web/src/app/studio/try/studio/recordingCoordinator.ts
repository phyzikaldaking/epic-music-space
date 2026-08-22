import { createRecordingTake, validatePunchRange, type RecordingTake } from "./recording";

export type TrackRecorder = {
  start: () => void;
  stop: () => Promise<{ sourceId: string; durationSec: number }>;
  cancel: () => void;
  dispose: () => void;
};

type ArmedTrack = { trackId: string; laneId: string };
type ActiveTrack = ArmedTrack & { recorder: TrackRecorder };
type StartOptions = { startedAtSec: number; punch?: { inSec: number; outSec: number } };

export function createRecordingCoordinator(input: { createRecorder: (trackId: string) => TrackRecorder }) {
  const armed = new Map<string, ArmedTrack>();
  const active = new Map<string, ActiveTrack>();
  const passes = new Map<string, number>();
  let startOptions: StartOptions | null = null;
  let disposed = false;

  function assertUsable() {
    if (disposed) throw new Error("Recording coordinator is disposed.");
  }

  function startRecorders() {
    for (const value of armed.values()) {
      const recorder = input.createRecorder(value.trackId);
      recorder.start();
      active.set(value.trackId, { ...value, recorder });
    }
  }

  return {
    arm(value: ArmedTrack) {
      assertUsable();
      if (active.has(value.trackId)) throw new Error("Cannot re-arm a track during recording.");
      armed.set(value.trackId, value);
    },
    disarm(trackId: string) {
      assertUsable();
      if (active.has(trackId)) throw new Error("Cannot disarm a track during recording.");
      armed.delete(trackId);
    },
    start(options: StartOptions) {
      assertUsable();
      if (active.size) throw new Error("Recording is already active.");
      if (!armed.size) throw new Error("Arm at least one track before recording.");
      if (options.punch) {
        const validity = validatePunchRange(options.punch);
        if (!validity.ok) throw new Error(validity.reason);
      }
      startOptions = options;
      startRecorders();
    },
    async completePass(options: { loop?: boolean } = {}): Promise<RecordingTake[]> {
      assertUsable();
      if (!startOptions || !active.size) throw new Error("No recording pass is active.");
      const completed = await Promise.all(Array.from(active.values(), async (value) => {
        const result = await value.recorder.stop();
        value.recorder.dispose();
        const pass = (passes.get(value.laneId) ?? 0) + 1;
        passes.set(value.laneId, pass);
        const startedAtSec = startOptions!.punch?.inSec ?? startOptions!.startedAtSec;
        const maximumDuration = startOptions!.punch ? startOptions!.punch.outSec - startOptions!.punch.inSec : result.durationSec;
        return createRecordingTake({
          trackId: value.trackId,
          laneId: value.laneId,
          pass,
          sourceId: result.sourceId,
          startedAtSec,
          durationSec: Math.min(result.durationSec, maximumDuration),
        });
      }));
      active.clear();
      if (options.loop) startRecorders();
      else startOptions = null;
      return completed;
    },
    cancel() {
      active.forEach((value) => {
        value.recorder.cancel();
        value.recorder.dispose();
      });
      active.clear();
      startOptions = null;
    },
    dispose() {
      active.forEach((value) => value.recorder.dispose());
      active.clear();
      armed.clear();
      disposed = true;
    },
    getState() {
      return { armedTrackIds: [...armed.keys()], activeTrackIds: [...active.keys()], recording: active.size > 0 };
    },
  };
}

export type RecordingCoordinator = ReturnType<typeof createRecordingCoordinator>;

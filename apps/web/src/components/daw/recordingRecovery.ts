// Crash recovery for in-flight recordings.
//
// The engine writes a breadcrumb to localStorage when startRecording
// fires and clears it on a clean stopRecording. If a crash/refresh
// happens mid-take we leave the breadcrumb dangling — readInFlight()
// returns it on next mount so the workspace can surface a "looks like
// your last take got cut off — recover it?" notice.
//
// We can't recover the actual audio (MediaRecorder chunks live in
// engine memory, which is gone on crash), but we *can* tell the user
// what trackName they were tracking, jump to the take browser if any
// take landed before the crash, and clear the flag so the prompt
// doesn't reappear.

const STORAGE_KEY = "ems.studio.recording.inFlight.v1";

export interface RecordingInFlight {
  trackId: string;
  trackName: string;
  startedAt: string;
}

export function readInFlight(): RecordingInFlight | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecordingInFlight>;
    if (
      typeof parsed.trackId !== "string" ||
      typeof parsed.trackName !== "string" ||
      typeof parsed.startedAt !== "string"
    ) {
      // Malformed payload — clear it so we don't keep showing the
      // recovery prompt for a corrupted breadcrumb.
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as RecordingInFlight;
  } catch {
    return null;
  }
}

export function clearInFlight(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the breadcrumb is older than `staleSeconds`. Used to
 *  ignore breadcrumbs from a *current* session — the recovery prompt
 *  only makes sense for breadcrumbs that survived a tab close /
 *  process death. */
export function isStale(rec: RecordingInFlight, staleSeconds = 5): boolean {
  const at = new Date(rec.startedAt).getTime();
  return Number.isFinite(at) && Date.now() - at > staleSeconds * 1000;
}

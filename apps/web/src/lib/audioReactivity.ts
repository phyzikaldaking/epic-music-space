/**
 * Tiny audio-reactivity helper. Exposes a smoothed bass-band amplitude
 * (0..1) that any visual layer can read every frame without requiring
 * its own Web Audio plumbing.
 *
 * Design notes / why it's bulletproof:
 *
 *   • Singleton AudioContext + AnalyserNode. createMediaElementSource()
 *     is *destructive* — the audio element's signal is routed through
 *     the graph after the call, so we have to wire `source -> analyser
 *     -> destination` or audio stops playing. Tracking attachment in a
 *     module-level Set means a second attach() call on the same element
 *     is a no-op and not a "InvalidStateError: HTMLMediaElement already
 *     connected" crash.
 *
 *   • AudioContext starts suspended on most browsers (autoplay policy)
 *     and only resumes after a user gesture. We attempt resume() inside
 *     attach() — if no gesture has happened yet, it'll be queued by the
 *     browser and resolve on first play() attempt. Failing resume() is
 *     not fatal — `getAudioLevel()` just returns 0 until it succeeds.
 *
 *   • Cross-origin audio sources: createMediaElementSource taints the
 *     analyser unless the audio was loaded with CORS. The PlayerContext
 *     already sets crossOrigin="anonymous"; if a CDN somewhere strips
 *     CORS headers, we get a silent-zero signal — never a crash.
 *
 *   • Every public API call is wrapped — Safari has historically thrown
 *     on AudioContext construction in obscure modes, and we never want
 *     a backdrop's vanity feature to crash the whole tab.
 *
 *   • getAudioLevel() returns a smoothed value: each call decays the
 *     previous reading toward the new sample so bass hits don't pop and
 *     silences fade gracefully. Cheap one-line lerp.
 */

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataBuf: Uint8Array | null = null;
const attachedElements = new WeakSet<HTMLMediaElement>();
let smoothedLevel = 0;
let initFailed = false;
let userActivated = false;
const pendingAudio = new WeakSet<HTMLMediaElement>();

function deferAttachUntilGesture(audio: HTMLMediaElement): boolean {
  if (pendingAudio.has(audio)) return false;
  pendingAudio.add(audio);
  const activate = () => {
    userActivated = true;
    pendingAudio.delete(audio);
    attachAudioElement(audio);
  };
  window.addEventListener("pointerdown", activate, { once: true, passive: true });
  window.addEventListener("keydown", activate, { once: true });
  audio.addEventListener("play", activate, { once: true });
  return false;
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  if (initFailed) return null;
  if (typeof window === "undefined") return null;

  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      initFailed = true;
      return null;
    }
    ctx = new Ctor();
    analyser = ctx.createAnalyser();
    // 256 bins gives 128 frequency buckets — enough granularity for the
    // bass band (first ~6 bins below 250Hz at 44.1kHz) and cheap to
    // copy into a Uint8Array each frame.
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    dataBuf = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(ctx.destination);
    return ctx;
  } catch (err) {
    console.warn("[audioReactivity] init failed", err);
    initFailed = true;
    return null;
  }
}

/**
 * Connect an audio element to the shared analyser. Idempotent — calling
 * it twice on the same element is a safe no-op. Returns true if the
 * element is now feeding the analyser, false if Web Audio is unavailable
 * or the element was already attached elsewhere in a way we couldn't
 * recover from.
 */
export function attachAudioElement(audio: HTMLMediaElement): boolean {
  if (typeof window === "undefined") return false;
  if (attachedElements.has(audio)) return true;
  if (!userActivated && audio.paused) return deferAttachUntilGesture(audio);
  userActivated = true;

  const acx = ensureContext();
  if (!acx || !analyser) return false;

  try {
    const source = acx.createMediaElementSource(audio);
    source.connect(analyser);
    attachedElements.add(audio);

    // Best-effort resume. If no user gesture yet, this remains pending
    // and resolves on first play; failing it is fine, getAudioLevel()
    // just returns 0 until the context is running.
    if (acx.state === "suspended") {
      acx.resume().catch(() => {
        /* will retry on next call */
      });
    }
    return true;
  } catch (err) {
    // The most common cause: the element was already routed through a
    // different AudioContext (e.g. dev-mount loop in StrictMode), and
    // re-routing isn't allowed. Mark it attached anyway — the existing
    // route is still feeding the analyser if it was *ours*.
    console.warn("[audioReactivity] attach failed", err);
    attachedElements.add(audio);
    return false;
  }
}

/**
 * Read the current bass-band amplitude as a smoothed 0..1 number. Cheap
 * — one getByteFrequencyData() call + a slice average. Safe to call
 * every animation frame from many components; the underlying analyser
 * just keeps the latest sample.
 */
export function getAudioLevel(): number {
  if (!ctx || !analyser || !dataBuf) {
    return 0;
  }
  if (ctx.state !== "running") {
    // Decay any held level so visuals settle when audio pauses.
    smoothedLevel *= 0.92;
    return smoothedLevel;
  }

  try {
    analyser.getByteFrequencyData(dataBuf as unknown as Uint8Array<ArrayBuffer>);
    // First 6 bins ≈ 0–250 Hz (bass) at fftSize=256, sampleRate=44.1kHz.
    const bins = 6;
    let sum = 0;
    for (let i = 0; i < bins; i++) sum += dataBuf[i] ?? 0;
    const avg = sum / bins / 255; // 0..1

    // Asymmetric lerp — fast attack on hits, slow decay on silences.
    // Reads as "punchy" rather than "wavering."
    if (avg > smoothedLevel) {
      smoothedLevel = smoothedLevel * 0.6 + avg * 0.4;
    } else {
      smoothedLevel = smoothedLevel * 0.88 + avg * 0.12;
    }
    return smoothedLevel;
  } catch {
    return smoothedLevel;
  }
}

/**
 * Test hook — exported only so the test suite can simulate beat hits
 * without the Web Audio API. Production callers should never use this.
 */
export function __setAudioLevelForTest(level: number) {
  smoothedLevel = Math.max(0, Math.min(1, level));
}

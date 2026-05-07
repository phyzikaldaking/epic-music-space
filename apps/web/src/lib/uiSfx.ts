type UiSfxKind = "tap" | "page" | "menu-open" | "menu-close" | "accent" | "hover" | "arrow-up" | "arrow-down";

type UiSfxListener = (enabled: boolean) => void;

const STORAGE_KEY = "ems-ui-sfx-enabled-v1";

function readStoredEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw !== "0";
}

class UiSfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private listeners = new Set<UiSfxListener>();

  constructor() {
    this.enabled = readStoredEnabled();
  }

  subscribe(listener: UiSfxListener): () => void {
    this.listeners.add(listener);
    listener(this.enabled);
    return () => this.listeners.delete(listener);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(next: boolean): void {
    this.enabled = next;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
    this.listeners.forEach((listener) => listener(next));
  }

  toggle(): boolean {
    const next = !this.enabled;
    this.setEnabled(next);
    return next;
  }

  async warmup(): Promise<void> {
    if (!this.enabled) return;
    this.ensureContext();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  async play(kind: UiSfxKind): Promise<void> {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx || !this.master) return;

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const t = this.ctx.currentTime;
    switch (kind) {
      case "tap":
        this.blip(t, 520, 640, 0.045, 0.03, "triangle");
        break;
      case "page":
        this.blip(t, 720, 560, 0.06, 0.038, "sine");
        this.blip(t + 0.02, 920, 760, 0.05, 0.028, "triangle");
        break;
      case "menu-open":
        this.blip(t, 420, 560, 0.065, 0.04, "triangle");
        this.blip(t + 0.03, 560, 760, 0.07, 0.028, "sine");
        break;
      case "menu-close":
        this.blip(t, 760, 560, 0.055, 0.035, "triangle");
        this.blip(t + 0.02, 560, 430, 0.05, 0.025, "sine");
        break;
      case "accent":
        this.blip(t, 680, 880, 0.07, 0.04, "triangle");
        break;
      case "hover":
        this.blip(t, 700, 720, 0.012, 0.018, "sine");
        break;
      case "arrow-up":
        this.blip(t, 480, 640, 0.022, 0.025, "sine");
        break;
      case "arrow-down":
        this.blip(t, 640, 480, 0.022, 0.025, "sine");
        break;
    }
  }

  private ensureContext(): void {
    if (this.ctx && this.master) return;
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
  }

  private blip(
    startAt: number,
    fromFreq: number,
    toFreq: number,
    duration: number,
    peakGain: number,
    wave: OscillatorType,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = wave;
    osc.frequency.setValueAtTime(fromFreq, startAt);
    osc.frequency.exponentialRampToValueAtTime(Math.max(50, toFreq), startAt + duration);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    osc.connect(gain);
    gain.connect(this.master);

    osc.start(startAt);
    osc.stop(startAt + duration + 0.01);
  }
}

let singleton: UiSfxEngine | null = null;

export function getUiSfx(): UiSfxEngine {
  if (!singleton) singleton = new UiSfxEngine();
  return singleton;
}

export type { UiSfxKind };

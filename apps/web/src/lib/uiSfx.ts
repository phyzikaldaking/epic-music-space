type UiSfxKind =
  | "tap"
  | "page"
  | "page-studio"
  | "page-auth"
  | "page-dashboard"
  | "menu-open"
  | "menu-close"
  | "accent"
  | "hover"
  | "arrow-up"
  | "arrow-down";

type UiSfxLevel = "off" | "subtle" | "full";
type UiSfxCategory = "navigation" | "menu" | "accent" | "hover";

type UiSfxSettings = {
  level: UiSfxLevel;
  categories: Record<UiSfxCategory, boolean>;
  haptics: boolean;
};

type UiSfxListener = (settings: UiSfxSettings) => void;

const SETTINGS_STORAGE_KEY = "ems-ui-sfx-settings-v2";

const DEFAULT_CATEGORIES: Record<UiSfxCategory, boolean> = {
  navigation: true,
  menu: true,
  accent: true,
  hover: true,
};

const DEFAULT_COOLDOWN_MS: Record<Exclude<UiSfxLevel, "off">, number> = {
  subtle: 60,
  full: 45,
};

const DEFAULT_VOLUME_SCALE: Record<Exclude<UiSfxLevel, "off">, number> = {
  subtle: 0.68,
  full: 1,
};

function supportsHaptics(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof (navigator as Navigator & { vibrate?: (ms: number) => boolean }).vibrate === "function";
}

function shouldAutoDisableFromDevice(): boolean {
  if (typeof window === "undefined") return false;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const reducedTransparency = window.matchMedia?.("(prefers-reduced-transparency: reduce)")?.matches ?? false;
  const nav = navigator as Navigator & {
    connection?: {
      saveData?: boolean;
    };
  };
  const saveData = nav.connection?.saveData === true;
  return reducedMotion || reducedTransparency || saveData;
}

function defaultSettings(): UiSfxSettings {
  return {
    level: shouldAutoDisableFromDevice() ? "off" : "subtle",
    categories: { ...DEFAULT_CATEGORIES },
    haptics: supportsHaptics(),
  };
}

function sanitizeLevel(value: unknown): UiSfxLevel {
  if (value === "off" || value === "subtle" || value === "full") return value;
  return "subtle";
}

function readStoredSettings(): UiSfxSettings {
  const fallback = defaultSettings();
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<UiSfxSettings>;
    return {
      level: sanitizeLevel(parsed.level),
      categories: {
        navigation: parsed.categories?.navigation ?? fallback.categories.navigation,
        menu: parsed.categories?.menu ?? fallback.categories.menu,
        accent: parsed.categories?.accent ?? fallback.categories.accent,
        hover: parsed.categories?.hover ?? fallback.categories.hover,
      },
      haptics: parsed.haptics ?? fallback.haptics,
    };
  } catch {
    return fallback;
  }
}

function kindCategory(kind: UiSfxKind): UiSfxCategory {
  if (kind === "menu-open" || kind === "menu-close") return "menu";
  if (kind === "accent") return "accent";
  if (kind === "hover") return "hover";
  return "navigation";
}

class UiSfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private settings: UiSfxSettings;
  private lastPlayedAt = 0;
  private listeners = new Set<UiSfxListener>();
  private activated = false;

  constructor() {
    this.settings = readStoredSettings();
  }

  subscribe(listener: UiSfxListener): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  isEnabled(): boolean {
    return this.settings.level !== "off";
  }

  getSettings(): UiSfxSettings {
    return {
      level: this.settings.level,
      categories: { ...this.settings.categories },
      haptics: this.settings.haptics,
    };
  }

  setLevel(level: UiSfxLevel): void {
    this.settings.level = level;
    this.persistAndNotify();
  }

  cycleLevel(): UiSfxLevel {
    const next = this.settings.level === "off" ? "subtle" : this.settings.level === "subtle" ? "full" : "off";
    this.setLevel(next);
    return next;
  }

  setCategoryEnabled(category: UiSfxCategory, enabled: boolean): void {
    this.settings.categories[category] = enabled;
    this.persistAndNotify();
  }

  setHapticsEnabled(enabled: boolean): void {
    this.settings.haptics = enabled;
    this.persistAndNotify();
  }

  private persistAndNotify(): void {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    }
    const snapshot = this.getSettings();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  async warmup(): Promise<void> {
    if (!this.isEnabled()) return;
    this.activated = true;
    this.ensureContext();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  async play(kind: UiSfxKind): Promise<void> {
    if (!this.isEnabled() || !this.activated) return;
    if (!this.settings.categories[kindCategory(kind)]) return;

    const now = Date.now();
    const cooldown = DEFAULT_COOLDOWN_MS[this.settings.level === "off" ? "subtle" : this.settings.level];
    if (now - this.lastPlayedAt < cooldown) return;
    this.lastPlayedAt = now;

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
      case "page-studio":
        this.blip(t, 660, 520, 0.06, 0.04, "triangle");
        this.blip(t + 0.02, 800, 980, 0.055, 0.03, "sine");
        break;
      case "page-auth":
        this.blip(t, 560, 500, 0.05, 0.03, "sine");
        this.blip(t + 0.016, 700, 620, 0.04, 0.024, "triangle");
        break;
      case "page-dashboard":
        this.blip(t, 740, 610, 0.06, 0.038, "triangle");
        this.blip(t + 0.018, 900, 760, 0.05, 0.03, "sine");
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

    this.triggerHaptics(kind);
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

  private triggerHaptics(kind: UiSfxKind): void {
    if (!this.settings.haptics) return;
    if (kind === "hover") return;
    if (typeof navigator === "undefined") return;
    const vibrate = (navigator as Navigator & { vibrate?: (ms: number) => boolean }).vibrate;
    if (!vibrate) return;
    vibrate(kind === "accent" ? 10 : 7);
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
    const level = this.settings.level === "off" ? "subtle" : this.settings.level;
    const volumeScale = DEFAULT_VOLUME_SCALE[level];
    const pitchVariance = 1 + (Math.random() * 0.08 - 0.04);
    const gainVariance = 1 + (Math.random() * 0.06 - 0.03);

    osc.type = wave;
    osc.frequency.setValueAtTime(fromFreq * pitchVariance, startAt);
    osc.frequency.exponentialRampToValueAtTime(Math.max(50, toFreq * pitchVariance), startAt + duration);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peakGain * gainVariance * volumeScale),
      startAt + 0.01,
    );
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

export type { UiSfxCategory, UiSfxKind, UiSfxLevel, UiSfxSettings };

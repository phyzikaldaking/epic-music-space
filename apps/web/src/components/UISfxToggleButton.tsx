"use client";

import { useEffect, useRef, useState } from "react";
import { getUiSfx, type UiSfxCategory, type UiSfxLevel, type UiSfxSettings } from "@/lib/uiSfx";

const ONBOARDING_KEY = "ems-ui-sfx-onboarding-seen-v1";

const LEVELS: UiSfxLevel[] = ["off", "subtle", "full"];

const CATEGORY_LABELS: Record<UiSfxCategory, string> = {
  navigation: "Navigation",
  menu: "Menu",
  accent: "Accent",
  hover: "Hover",
};

function levelLabel(level: UiSfxLevel): string {
  if (level === "off") return "Off";
  if (level === "subtle") return "Subtle";
  return "Full";
}

export default function UISfxToggleButton() {
  const sfx = getUiSfx();
  const [settings, setSettings] = useState<UiSfxSettings>(sfx.getSettings());
  const [open, setOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return sfx.subscribe(setSettings);
  }, [sfx]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowOnboarding(!window.localStorage.getItem(ONBOARDING_KEY));
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!containerRef.current || !target) return;
      if (!containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const label = `UI sounds: ${levelLabel(settings.level)}`;

  function markOnboardingSeen(): void {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_KEY, "1");
    }
    setShowOnboarding(false);
  }

  async function setLevel(level: UiSfxLevel): Promise<void> {
    sfx.setLevel(level);
    if (level !== "off") {
      await sfx.warmup();
      await sfx.play(level === "full" ? "accent" : "menu-open");
    }
  }

  return (
    <div ref={containerRef} className="relative hidden sm:flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        data-ui-sfx="tap"
        onClick={async () => {
          setOpen((current) => !current);
          if (settings.level !== "off") {
            await sfx.play("tap");
          }
        }}
        className={`h-9 min-w-20 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold text-white/80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
          settings.level === "off"
            ? "border-white/12 bg-white/4 hover:bg-white/10"
            : "border-cyan-300/40 bg-cyan-400/10 hover:bg-cyan-400/20"
        }`}
      >
        SFX {levelLabel(settings.level)}
      </button>

      {showOnboarding ? (
        <div className="absolute right-0 top-11 z-[70] w-72 rounded-xl border border-cyan-300/35 bg-[#0a111a] p-3 text-sm text-white shadow-xl shadow-cyan-900/30">
          <p className="font-semibold text-cyan-100">Sound check</p>
          <p className="mt-1 text-xs text-white/70">Pick a default profile. You can refine categories anytime.</p>
          <div className="mt-3 flex items-center gap-2">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                data-ui-sfx="tap"
                onClick={async () => {
                  await setLevel(level);
                  markOnboardingSeen();
                }}
                className="rounded-md border border-white/20 px-2 py-1 text-xs font-medium text-white/85 hover:bg-white/10"
              >
                {levelLabel(level)}
              </button>
            ))}
            <button
              type="button"
              onClick={markOnboardingSeen}
              className="ml-auto rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            >
              Later
            </button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="absolute right-0 top-11 z-[65] w-80 rounded-xl border border-white/14 bg-[#0c0f15] p-3 text-sm text-white shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/55">UI Sound Profile</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {LEVELS.map((level) => {
              const selected = settings.level === level;
              return (
                <button
                  key={level}
                  type="button"
                  data-ui-sfx="tap"
                  onClick={() => {
                    void setLevel(level);
                  }}
                  className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? "border-cyan-300/60 bg-cyan-300/18 text-cyan-100"
                      : "border-white/15 text-white/75 hover:bg-white/8"
                  }`}
                >
                  {levelLabel(level)}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/55">Categories</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(CATEGORY_LABELS) as UiSfxCategory[]).map((category) => (
              <label
                key={category}
                className="flex items-center gap-2 rounded-md border border-white/10 bg-white/4 px-2 py-1.5 text-xs text-white/80"
              >
                <input
                  type="checkbox"
                  checked={settings.categories[category]}
                  onChange={(event) => {
                    sfx.setCategoryEnabled(category, event.currentTarget.checked);
                  }}
                  className="h-3.5 w-3.5 accent-cyan-400"
                />
                {CATEGORY_LABELS[category]}
              </label>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-white/4 px-2 py-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={settings.haptics}
              onChange={(event) => {
                sfx.setHapticsEnabled(event.currentTarget.checked);
              }}
              className="h-3.5 w-3.5 accent-cyan-400"
            />
            Mobile haptics pairing
          </label>
        </div>
      ) : null}
    </div>
  );
}

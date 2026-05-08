"use client";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  /** Two-position metal toggle: when ON, shows the labelOn position. */
  labelOn?: string;
  labelOff?: string;
  /** LED color when ON. */
  tone?: "amber" | "green" | "rec";
  className?: string;
  disabled?: boolean;
};

/**
 * Tactile two-position toggle switch — replaces checkboxes for any
 * meaningful state ("Save as draft", "Active", "Free download"). The
 * little LED next to the lever lights up when active. Reads as a piece
 * of hardware, not an HTML control.
 */
export default function ToggleSwitch({
  checked,
  onChange,
  label,
  labelOn = "ON",
  labelOff = "OFF",
  tone = "amber",
  className = "",
  disabled,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`flex items-center gap-3 rounded-md px-3 py-2 studio-faceplate-dark disabled:opacity-50 ${className}`}
    >
      {/* The metal lever. Travels up = ON (top label), down = OFF. */}
      <span
        aria-hidden
        className="relative inline-flex h-9 w-6 flex-shrink-0 flex-col items-center justify-between rounded-sm py-1"
        style={{
          background:
            "linear-gradient(180deg, #1c1d20 0%, #0a0b0d 50%, #1c1d20 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.7)",
        }}
      >
        {/* Channel tracks for the lever. */}
        <span className="studio-label text-[8px] text-white/35 leading-none">
          {labelOn}
        </span>
        {/* Lever cap. Slides between top (checked) and bottom (unchecked). */}
        <span
          className="absolute left-1/2 -translate-x-1/2 transition-all"
          style={{
            top: checked ? 4 : "auto",
            bottom: checked ? "auto" : 4,
            width: 14,
            height: 14,
            borderRadius: 3,
            background:
              "linear-gradient(180deg, #d8dadf 0%, #8a8c92 45%, #2c2e33 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 2px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.7)",
          }}
        />
        <span className="studio-label text-[8px] text-white/35 leading-none">
          {labelOff}
        </span>
      </span>

      {/* LED next to the lever. */}
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${
          checked ? `led-on-${tone}` : "led-off"
        }`}
      />

      {label && (
        <span className="studio-label text-white/70 text-left">{label}</span>
      )}
    </button>
  );
}

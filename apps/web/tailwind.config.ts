import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // EMS purple — primary brand
        brand: {
          50:  "#f0edff",
          100: "#e3ddff",
          200: "#c7bafe",
          300: "#a99bf9",
          400: "#9b8fff",
          500: "#6C5CE7",   // EMS purple
          600: "#5a4bcf",
          700: "#4a3baa",
          800: "#372d80",
          900: "#1e1850",
        },
        // Cyan — secondary accent
        accent: {
          300: "#66faff",
          400: "#33f8ff",
          500: "#00F5FF",   // EMS cyan
          600: "#00d4de",
          700: "#009faa",
        },
        // Gold — premium / earnings
        gold: {
          300: "#ffe566",
          400: "#ffda00",
          500: "#FFD700",   // EMS gold
          600: "#d4b000",
          700: "#a88900",
        },
        // Static surface tokens
        card: "#141414",
        surface: "#1a1a1f",
        // ── Analog studio palette ──────────────────────────────────────
        // Use these for ANY new surface treatment instead of one-off hex.
        // The whole site is supposed to read like a piece of pro audio
        // gear: warm walnut, brushed steel, panel paint, recessed LCD
        // screens, illuminated tube/LED accents.
        walnut: {
          50:  "#3b2a1d",
          100: "#33241a",
          200: "#2a1d14",
          300: "#221710",
          400: "#1a110b",
          500: "#140d08", // deep walnut — side panels of a classic console
        },
        steel: {
          50:  "#dcdce0", // polished chrome highlight
          100: "#a9aab0", // lit faceplate
          200: "#7e8086", // brushed faceplate (default panel)
          300: "#54565c", // recessed panel
          400: "#3a3c42", // panel shadow
          500: "#26282d", // bezel
          600: "#1a1c20", // deep bezel
          700: "#101216", // rack rail
          800: "#0a0b0e", // rack interior
          900: "#050609", // void inside the rack
        },
        // The dark inset "screen" colour for digital readouts (BPM, $,
        // counters). Reads like an LCD/VFD on real hardware.
        screen: {
          DEFAULT: "#06090c",
          glow: "#0a1418",
        },
        // Tube-amp / VU-needle warm amber. The "on" colour for active
        // readouts, level peaks, recording lights.
        tube: {
          300: "#ffd28a",
          400: "#ffb04a", // VU needle illuminated
          500: "#ff8a1e", // tube glow
          600: "#cc6a10",
        },
        // Recording-room red — REC light, "on air", critical state.
        rec: {
          400: "#ff5a4a",
          500: "#e8261c",
          600: "#b81a13",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        // Big stenciled labels: "MASTER", "INPUT", "OUTPUT", panel titles.
        display: ["var(--font-bebas-neue)", "Bebas Neue", "sans-serif"],
        // Numerical readouts on LCD screens — BPM, plays, $.
        readout: ["var(--font-orbitron)", "Orbitron", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Inset bevel shadows so panels look CNC-machined, not flat.
        "panel-bevel":
          "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.6), 0 1px 0 rgba(0,0,0,0.5)",
        "panel-bevel-deep":
          "inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -2px 0 rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.55)",
        // The dark "screen" pressed into a panel — recessed, LCD-style.
        "screen-inset":
          "inset 0 2px 6px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05)",
        // Tube glow / LED on.
        "tube-on":
          "0 0 10px rgba(255,176,74,0.45), 0 0 24px rgba(255,176,74,0.25)",
        "rec-on":
          "0 0 10px rgba(232,38,28,0.55), 0 0 28px rgba(232,38,28,0.3)",
        // Knob / fader cap — soft chrome.
        knob:
          "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 4px rgba(0,0,0,0.65), 0 2px 4px rgba(0,0,0,0.5)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%":        { opacity: "0.85", filter: "brightness(1.3)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":       { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
        float:        "float 4s ease-in-out infinite",
        shimmer:      "shimmer 2.5s linear infinite",
        "fade-up":    "fade-up 0.5s ease-out both",
      },
      backgroundImage: {
        "gradient-ems":  "linear-gradient(135deg, #6C5CE7 0%, #00F5FF 100%)",
        "gradient-gold": "linear-gradient(135deg, #FFD700 0%, #ff9800 100%)",
        "gradient-city": "radial-gradient(ellipse at 50% 0%, rgba(108,92,231,0.35) 0%, rgba(0,0,0,0) 65%)",
      },
    },
  },
  plugins: [],
};

export default config;

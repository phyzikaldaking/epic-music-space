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
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
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
          "0%":   { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-right": {
          "0%":   { opacity: "0", transform: "translateX(-24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "mesh-move": {
          "0%, 100%": {
            backgroundPosition: "0% 50%",
          },
          "50%": {
            backgroundPosition: "100% 50%",
          },
        },
        "orb-drift": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%":       { transform: "translate(60px, -40px) scale(1.05)" },
          "66%":       { transform: "translate(-40px, 30px) scale(0.98)" },
        },
        "scan": {
          "0%":   { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 100vh" },
        },
        "counter-up": {
          "0%":   { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
        float:        "float 4s ease-in-out infinite",
        shimmer:      "shimmer 2.5s linear infinite",
        "fade-up":    "fade-up 0.7s ease-out both",
        "fade-in":    "fade-in 0.6s ease-out both",
        "slide-right":"slide-right 0.7s ease-out both",
        "mesh-move":  "mesh-move 12s ease infinite",
        "orb-drift":  "orb-drift 20s ease-in-out infinite",
      },
      backgroundImage: {
        "gradient-ems":  "linear-gradient(135deg, #6C5CE7 0%, #00F5FF 100%)",
        "gradient-gold": "linear-gradient(135deg, #FFD700 0%, #ff9800 100%)",
        "gradient-city": "radial-gradient(ellipse at 50% 0%, rgba(108,92,231,0.35) 0%, rgba(0,0,0,0) 65%)",
      },
      transitionDuration: {
        "400": "400ms",
      },
    },
  },
  plugins: [],
};

export default config;

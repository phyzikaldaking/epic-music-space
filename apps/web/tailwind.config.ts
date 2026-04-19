import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "ems-black": "#0A0A0F",
        "ems-gold": "#D4AF37",
        "ems-purple": "#7B3FE4",
        "ems-text": "#F0F0F0",
        "ems-surface": "#13131A",
        "ems-border": "#2A2A3A",
      },
      fontFamily: {
        sora: ["Sora", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "city-grid":
          "linear-gradient(rgba(212,175,55,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.05) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        gold: "0 0 20px rgba(212,175,55,0.3)",
        purple: "0 0 20px rgba(123,63,228,0.3)",
        neon: "0 0 40px rgba(212,175,55,0.15), 0 0 80px rgba(123,63,228,0.1)",
      },
      animation: {
        "pulse-gold": "pulseGold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        pulseGold: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        glow: {
          from: { textShadow: "0 0 10px #D4AF37, 0 0 20px #D4AF37" },
          to: { textShadow: "0 0 20px #D4AF37, 0 0 40px #D4AF37, 0 0 80px #D4AF37" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

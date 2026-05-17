export const EMS_VISUAL_SYSTEM = {
  shell: {
    carbon: "bg-[linear-gradient(135deg,#15191d_0%,#050607_48%,#11161a_100%)]",
    glass: "border border-white/10 bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_18px_60px_rgba(0,0,0,.55)] backdrop-blur",
    console: "border border-cyan-300/20 bg-[#030507] shadow-[inset_0_0_70px_rgba(23,255,244,.08),0_0_34px_rgba(0,0,0,.45)]",
    rail: "bg-[linear-gradient(90deg,#0b0f12_0%,#1d2429_12%,#050607_50%,#1d2429_88%,#0b0f12_100%)]",
  },
  accents: {
    cyan: "#00f0ff",
    magenta: "#ff2dcb",
    gold: "#ffd166",
    green: "#9cff2e",
    red: "#ff3b4f",
    purple: "#a855ff",
  },
  button: {
    cyan: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,.12)] hover:bg-cyan-300/16",
    magenta: "border-pink-300/35 bg-pink-300/10 text-pink-100 shadow-[0_0_16px_rgba(255,45,203,.12)] hover:bg-pink-300/16",
    gold: "border-yellow-300/35 bg-yellow-300/10 text-yellow-100 shadow-[0_0_16px_rgba(255,209,102,.12)] hover:bg-yellow-300/16",
    green: "border-green-300/35 bg-green-300/10 text-green-100 shadow-[0_0_16px_rgba(156,255,46,.12)] hover:bg-green-300/16",
    red: "border-red-300/35 bg-red-300/10 text-red-100 shadow-[0_0_16px_rgba(255,59,79,.12)] hover:bg-red-300/16",
    idle: "border-white/10 bg-[#0c1115] text-white/45 hover:text-white/80",
  },
  text: {
    micro: "font-mono text-[7px] font-black uppercase tracking-widest",
    tiny: "font-mono text-[8px] font-black uppercase tracking-widest",
    label: "font-mono text-[9px] font-black uppercase tracking-widest",
  },
} as const;

export function emsButton(active: boolean, tone: keyof typeof EMS_VISUAL_SYSTEM.button = "cyan") {
  return active ? EMS_VISUAL_SYSTEM.button[tone] : EMS_VISUAL_SYSTEM.button.idle;
}

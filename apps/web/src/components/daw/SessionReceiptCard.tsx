"use client";

import { useEffect, useRef, useState } from "react";

// Shareable session receipt — a generated PNG the producer can drop
// into their Stories / Discord / Twitter to prove they put in the
// work. Includes the project name, track count, take count, total
// session time, and the EMS Studio watermark.
//
// Rendered to <canvas> at 1080×1080 (square format that works
// everywhere). The user clicks "Download" and gets a PNG; clicking
// the canvas itself toggles the displayed glow accent.

type Props = {
  projectName: string;
  trackCount: number;
  takeCount: number;
  sessionMinutes: number;
};

export default function SessionReceiptCard({
  projectName,
  trackCount,
  takeCount,
  sessionMinutes,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    // Background gradient — amber/violet diagonals, the studio brand.
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#1a0e2e");
    grad.addColorStop(0.55, "#2a1556");
    grad.addColorStop(1, "#0a0a14");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Halo behind the title — diffuse glow effect using a radial.
    const halo = ctx.createRadialGradient(W * 0.5, H * 0.34, 60, W * 0.5, H * 0.34, W * 0.55);
    halo.addColorStop(0, "rgba(245,158,11,0.35)");
    halo.addColorStop(1, "rgba(245,158,11,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // Watermark grid (faint horizontal lines, like a tape deck).
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let y = 80; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(W - 40, y);
      ctx.stroke();
    }

    // Tracked-at chip
    ctx.fillStyle = "rgba(34,211,238,0.18)";
    roundRect(ctx, W * 0.5 - 130, H * 0.18, 260, 50, 25);
    ctx.fill();
    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 22px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("◉  TRACKED AT EMS STUDIO", W * 0.5, H * 0.18 + 25);

    // Project title
    ctx.fillStyle = "#fffbe8";
    ctx.font = "bold 72px Inter, system-ui, sans-serif";
    wrapText(ctx, projectName, W * 0.5, H * 0.36, W - 160, 78);

    // Stat row
    const stats = [
      { label: "TRACKS", value: String(trackCount) },
      { label: "TAKES", value: String(takeCount) },
      { label: "MINUTES", value: String(Math.round(sessionMinutes)) },
    ];
    const baseY = H * 0.62;
    stats.forEach((s, i) => {
      const x = W * (0.2 + i * 0.3);
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 120px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.value, x, baseY);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "bold 22px ui-monospace, monospace";
      ctx.fillText(s.label, x, baseY + 70);
    });

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "20px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      "epicmusicspace.com — your in-browser recording studio",
      W * 0.5,
      H - 60,
    );
  }, [projectName, trackCount, takeCount, sessionMinutes]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ems-session-${projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      window.setTimeout(() => setDownloaded(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-black/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">
          Session receipt
        </span>
        <button
          type="button"
          onClick={download}
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
            downloaded
              ? "bg-emerald-400 text-black"
              : "bg-amber-400 text-black hover:bg-amber-300"
          }`}
        >
          {downloaded ? "Saved ✓" : "Download PNG"}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={1080}
        height={1080}
        className="block w-full rounded-lg"
        style={{ aspectRatio: "1" }}
      />
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

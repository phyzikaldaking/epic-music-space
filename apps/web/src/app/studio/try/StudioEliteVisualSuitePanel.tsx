"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EMS_PLUGIN_SDK_REGISTRY, spectralAnalysis } from "./studioAdvancedDsp";

type NodePoint = { id: string; x: number; y: number; enabled: boolean; modulation: number };
type HistoryPoint = { peak: number; rms: number; lufs: number };

const SAMPLE_RATE = 44100;

function makeSamples(frame = 0) {
  const left = new Float32Array(2048);
  const right = new Float32Array(2048);
  for (let i = 0; i < left.length; i += 1) {
    const t = (i + frame * 128) / SAMPLE_RATE;
    left[i] = Math.sin(2 * Math.PI * 96 * t) * 0.25 + Math.sin(2 * Math.PI * 2400 * t) * 0.08;
    right[i] = Math.sin(2 * Math.PI * 104 * t) * 0.22 + Math.sin(2 * Math.PI * 3800 * t) * 0.1;
  }
  return { left, right };
}

function peak(samples: Float32Array) { return samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0); }
function rms(samples: Float32Array) { return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, samples.length)); }
function lufsApprox(value: number) { return -0.691 + 10 * Math.log10(Math.max(0.0000001, value * value)); }

export default function StudioEliteVisualSuitePanel() {
  const [frame, setFrame] = useState(0);
  const [nodes, setNodes] = useState<NodePoint[]>(() => EMS_PLUGIN_SDK_REGISTRY.map((plugin, index) => ({ id: plugin.id, x: 8 + index * 21, y: 35 + (index % 2) * 22, enabled: true, modulation: 0.25 + index * 0.12 })));
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audio = useMemo(() => makeSamples(frame), [frame]);
  const mono = useMemo(() => {
    const merged = new Float32Array(audio.left.length);
    for (let i = 0; i < merged.length; i += 1) merged[i] = (audio.left[i] + audio.right[i]) / 2;
    return merged;
  }, [audio]);
  const fft = useMemo(() => spectralAnalysis(mono, 256).slice(0, 64), [mono]);
  const currentRms = rms(mono);
  const currentPeak = peak(mono);
  const lufs = lufsApprox(currentRms);

  useEffect(() => {
    const timer = window.setInterval(() => setFrame((value) => value + 1), 160);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setHistory((current) => [...current.slice(-47), { peak: currentPeak, rms: currentRms, lufs }]);
  }, [currentPeak, currentRms, lufs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(34,211,238,.22)");
    gradient.addColorStop(1, "rgba(236,72,153,.18)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    fft.forEach((bin, index) => {
      const x = (index / fft.length) * width;
      const h = Math.min(height, bin.magnitude * 180);
      context.fillStyle = `rgba(103,232,249,${Math.min(0.95, 0.18 + bin.magnitude)})`;
      context.fillRect(x, height - h, Math.max(2, width / fft.length - 2), h);
    });
    for (let row = 0; row < 28; row += 1) {
      fft.forEach((bin, col) => {
        context.fillStyle = `rgba(244,114,182,${Math.min(0.7, 0.04 + bin.magnitude * row * 0.05)})`;
        context.fillRect((col / fft.length) * width, row * 4, Math.max(2, width / fft.length - 1), 2);
      });
    }
  }, [fft]);

  const dragStart = (id: string) => (event: React.DragEvent<HTMLDivElement>) => event.dataTransfer.setData("plugin-id", id);
  const dropNode = (targetId: string) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("plugin-id");
    setNodes((current) => {
      const sourceIndex = current.findIndex((node) => node.id === sourceId);
      const targetIndex = current.findIndex((node) => node.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      return next.map((node, index) => ({ ...node, x: 8 + index * 21 }));
    });
  };

  return (
    <section className="rounded-3xl border border-fuchsia-300/20 bg-black/50 p-4 text-white shadow-2xl shadow-fuchsia-950/20 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/70">Elite Visual Suite</p>
          <h2 className="text-2xl font-black uppercase">Node Graph + Realtime Analyzer</h2>
        </div>
        <div className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100">Animated FFT active</div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Node-cable graph editor</p>
          <div className="relative mt-3 h-64 overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {nodes.slice(0, -1).map((node, index) => <path key={`${node.id}-cable`} d={`M ${node.x + 8} ${node.y + 5} C ${node.x + 14} ${node.y + 5}, ${nodes[index + 1].x - 4} ${nodes[index + 1].y + 5}, ${nodes[index + 1].x} ${nodes[index + 1].y + 5}`} stroke="rgba(34,211,238,.55)" strokeWidth=".7" fill="none" />)}
              {nodes.map((node) => <line key={`${node.id}-mod`} x1="8" y1="88" x2={node.x + 5} y2={node.y + 8} stroke="rgba(244,114,182,.35)" strokeWidth=".35" strokeDasharray="2 2" />)}
            </svg>
            <div className="absolute left-3 bottom-3 rounded-lg border border-pink-300/30 bg-pink-400/10 px-3 py-2 text-xs font-black text-pink-100">LFO Mod Source</div>
            {nodes.map((node) => {
              const plugin = EMS_PLUGIN_SDK_REGISTRY.find((item) => item.id === node.id);
              return (
                <div key={node.id} draggable onDragStart={dragStart(node.id)} onDragOver={(event) => event.preventDefault()} onDrop={dropNode(node.id)} className="absolute w-36 cursor-grab rounded-xl border border-cyan-300/30 bg-black/80 p-3 shadow-xl shadow-cyan-950/20" style={{ left: `${node.x}%`, top: `${node.y}%` }}>
                  <p className="truncate text-xs font-black uppercase text-cyan-100">{plugin?.name ?? node.id}</p>
                  <p className="text-[10px] uppercase text-white/35">{plugin?.category}</p>
                  <input type="range" min="0" max="1" step="0.01" value={node.modulation} onChange={(event) => setNodes((current) => current.map((item) => item.id === node.id ? { ...item, modulation: Number(event.target.value) } : item))} className="mt-2 w-full accent-pink-300" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">GPU/WebGL-ready spectral canvas</p>
          <canvas ref={canvasRef} width={720} height={260} className="mt-3 h-64 w-full rounded-xl border border-white/10 bg-black/40" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Vectorscope / phase scope</p>
          <div className="relative mt-3 aspect-square rounded-full border border-white/10 bg-black/40">
            {Array.from({ length: 36 }).map((_, index) => {
              const left = audio.left[index * 16] ?? 0;
              const right = audio.right[index * 16] ?? 0;
              return <span key={index} className="absolute h-1.5 w-1.5 rounded-full bg-emerald-300" style={{ left: `${50 + left * 120}%`, top: `${50 + right * 120}%` }} />;
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Peak / RMS / LUFS history</p>
          <div className="mt-3 flex h-44 items-end gap-1 rounded-xl border border-white/10 bg-black/40 p-2">
            {history.map((point, index) => <div key={index} className="flex flex-1 flex-col justify-end gap-0.5"><span className="rounded-t bg-cyan-300/70" style={{ height: `${Math.min(100, point.peak * 250)}%` }} /><span className="rounded-t bg-pink-300/70" style={{ height: `${Math.min(100, point.rms * 520)}%` }} /></div>)}
          </div>
          <p className="mt-2 text-xs text-white/45">Peak {currentPeak.toFixed(2)} / RMS {currentRms.toFixed(2)} / LUFS {lufs.toFixed(1)}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Masking + transient heatmap</p>
          <div className="mt-3 grid grid-cols-12 gap-1 rounded-xl border border-white/10 bg-black/40 p-2">
            {fft.slice(0, 72).map((bin, index) => <span key={index} className="h-5 rounded-sm bg-yellow-300/60" style={{ opacity: Math.min(0.95, 0.12 + bin.magnitude * 0.9 + (index % 5 === 0 ? 0.18 : 0)) }} />)}
          </div>
          <p className="mt-2 text-xs uppercase tracking-widest text-white/35">Spectral masking and transient-density preview</p>
        </div>
      </div>
    </section>
  );
}

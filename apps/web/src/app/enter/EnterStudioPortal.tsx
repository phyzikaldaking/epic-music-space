"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const steps = [
  "Booting EMS world",
  "Loading studio rooms",
  "Checking audio engine",
  "Opening creative space",
];

export default function EnterStudioPortal() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(steps[0]);

  useEffect(() => {
    const startedAt = Date.now();
    const duration = 3200;
    const interval = window.setInterval(() => {
      const next = Math.min(100, Math.round(((Date.now() - startedAt) / duration) * 100));
      setProgress(next);
      setStep(steps[Math.min(steps.length - 1, Math.floor((next / 100) * steps.length))]);
      if (next >= 100) {
        window.clearInterval(interval);
        router.replace("/studio/try");
      }
    }, 90);
    return () => window.clearInterval(interval);
  }, [router]);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-black px-5 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(34,211,238,.28),transparent_26%),radial-gradient(circle_at_20%_20%,rgba(255,45,146,.25),transparent_24%),radial-gradient(circle_at_80%_72%,rgba(253,224,71,.16),transparent_30%),linear-gradient(180deg,#030307,#000)]" />
      <div className="absolute inset-0 opacity-65 [background-image:linear-gradient(rgba(34,211,238,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,45,146,.12)_1px,transparent_1px)] [background-size:76px_76px]" />
      <div className="absolute left-1/2 top-1/2 h-[44rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/20 shadow-[0_0_140px_rgba(34,211,238,.2),inset_0_0_90px_rgba(255,45,146,.08)]" />
      <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-pink-300/20 shadow-[0_0_90px_rgba(255,45,146,.18)]" />

      <section className="relative z-10 w-full max-w-2xl rounded-[2rem] border border-white/12 bg-black/60 p-7 text-center shadow-[0_0_100px_rgba(34,211,238,.22),inset_0_0_44px_rgba(255,255,255,.045)] backdrop-blur-xl sm:p-10">
        <p className="text-[10px] font-black uppercase tracking-[0.46em] text-cyan-200/80">Entering Epic Music Space</p>
        <h1 className="mt-4 font-display text-5xl font-black uppercase leading-none tracking-[0.08em] text-white sm:text-7xl">
          EMS
        </h1>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.32em] text-pink-200/80">Studio portal</p>
        <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-white/60">
          Loading the creative world before opening the studio. This keeps the website entry feeling like Epic Music Space instead of dropping users straight into the DAW.
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.035] p-4 text-left">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/50">
            <span>{step}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-black">
            <div className="h-full rounded-full bg-cyan-300 shadow-[0_0_22px_rgba(34,211,238,.8)] transition-[width] duration-100" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/studio/try" className="rounded-full border border-cyan-300/50 bg-cyan-300/15 px-7 py-3 text-xs font-black uppercase tracking-[0.24em] text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,.25)] transition hover:scale-[1.02] hover:bg-cyan-300/25">
            Enter Studio Now
          </Link>
          <Link href="/" className="rounded-full border border-white/15 bg-white/[.04] px-7 py-3 text-xs font-black uppercase tracking-[0.24em] text-white/62 transition hover:bg-white/10 hover:text-white">
            Back Home
          </Link>
        </div>
      </section>
    </main>
  );
}

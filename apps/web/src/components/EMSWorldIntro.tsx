"use client";

import { useEffect, useRef, useState } from "react";

import EMSScene3D from "@/components/EMSScene3D";

const INTRO_SEEN_KEY = "ems-world-intro-seen-v1";
const OPEN_INTRO_EVENT = "ems:open-world-intro";

function canAutoShow() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return window.sessionStorage.getItem(INTRO_SEEN_KEY) !== "true";
}

export default function EMSWorldIntro() {
  const [visible, setVisible] = useState(false);
  const [armed, setArmed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setVisible(canAutoShow());
  }, []);

  useEffect(() => {
    function open() {
      setArmed(false);
      setVisible(true);
    }

    window.addEventListener(OPEN_INTRO_EVENT, open);
    return () => window.removeEventListener(OPEN_INTRO_EVENT, open);
  }, []);

  function closeIntro(stopAudio = true) {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "true");
    if (stopAudio && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setVisible(false);
  }

  function openIntro() {
    setArmed(false);
    setVisible(true);
  }

  async function enterWorld() {
    setArmed(true);
    try {
      if (!audioRef.current) audioRef.current = new Audio("/api/audio/ems-intro");
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch {
      // Browsers can deny sound. The visual intro still works.
    }
    window.setTimeout(() => closeIntro(false), 3050);
  }

  if (!visible) {
    return (
      <button
        type="button"
        onClick={openIntro}
        className="fixed bottom-5 right-5 z-[80] rounded-full border border-cyan-300/35 bg-black/72 px-4 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100 shadow-[0_0_32px_rgba(34,211,238,.24)] backdrop-blur-xl transition hover:scale-[1.03] hover:border-cyan-200 hover:bg-cyan-300/14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
      >
        3D intro + sound
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden bg-black text-white" role="dialog" aria-label="Epic Music Space intro">
      <EMSScene3D variant="intro" active={visible} className="absolute inset-0 opacity-95" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(34,211,238,.18),transparent_28%),radial-gradient(circle_at_18%_20%,rgba(255,45,146,.18),transparent_24%),radial-gradient(circle_at_78%_70%,rgba(253,224,71,.12),transparent_30%),linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.78))]" />
      <div className="ems-intro-stars absolute inset-0 opacity-70" />
      <div className="ems-intro-grid absolute bottom-[-12%] left-1/2 h-[62vh] w-[150vw] -translate-x-1/2 rotate-x-[64deg] bg-[linear-gradient(rgba(34,211,238,.23)_1px,transparent_1px),linear-gradient(90deg,rgba(255,45,146,.22)_1px,transparent_1px)] bg-[size:72px_72px]" />

      <div className={`ems-intro-core relative z-10 grid place-items-center ${armed ? "ems-intro-launch" : ""}`}>
        <div className="ems-intro-orbit absolute h-[520px] w-[520px] rounded-full border border-cyan-300/20" />
        <div className="ems-intro-orbit ems-intro-orbit-2 absolute h-[390px] w-[390px] rounded-full border border-pink-300/20" />
        <div className="ems-intro-orbit ems-intro-orbit-3 absolute h-[270px] w-[270px] rounded-full border border-yellow-200/20" />

        <div className="ems-intro-city absolute bottom-[-120px] flex items-end gap-3 opacity-80">
          {Array.from({ length: 18 }, (_, index) => (
            <span
              key={index}
              className="block w-8 rounded-t-md border border-cyan-300/15 bg-cyan-300/10 shadow-[0_0_20px_rgba(34,211,238,.15)]"
              style={{ height: `${58 + ((index * 37) % 160)}px` }}
            />
          ))}
        </div>

        <div className="relative rounded-[2rem] border border-white/15 bg-black/55 px-8 py-7 text-center shadow-[0_0_90px_rgba(34,211,238,.25),inset_0_0_44px_rgba(255,255,255,.05)] backdrop-blur-xl sm:px-14 sm:py-10">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.52em] text-cyan-200/80">Booting creative universe</p>
          <h1 className="ems-intro-logo font-display text-5xl font-black uppercase leading-none tracking-[0.08em] text-white sm:text-7xl lg:text-8xl">
            EMS
          </h1>
          <p className="mt-3 text-sm font-black uppercase tracking-[0.34em] text-pink-200/80">Epic Music Space</p>
          <p className="mx-auto mt-5 max-w-md text-sm leading-6 text-white/58">
            Your studio. Your marketplace. Your city. A world built for creators to make the record and build the business.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={enterWorld}
              className="rounded-full border border-cyan-300/50 bg-cyan-300/15 px-7 py-3 text-xs font-black uppercase tracking-[0.24em] text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,.25)] transition hover:scale-[1.02] hover:bg-cyan-300/25"
            >
              Enter with sound
            </button>
            <button
              type="button"
              onClick={() => closeIntro()}
              className="rounded-full border border-white/15 bg-white/[.04] px-7 py-3 text-xs font-black uppercase tracking-[0.24em] text-white/62 transition hover:bg-white/10 hover:text-white"
            >
              Skip
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ems-intro-stars {
          background-image:
            radial-gradient(circle, rgba(255,255,255,.85) 1px, transparent 1px),
            radial-gradient(circle, rgba(34,211,238,.55) 1px, transparent 1px),
            radial-gradient(circle, rgba(255,45,146,.5) 1px, transparent 1px);
          background-size: 120px 120px, 180px 180px, 260px 260px;
          animation: ems-stars 9s linear infinite;
        }
        .ems-intro-grid {
          transform-style: preserve-3d;
          animation: ems-grid 2.4s linear infinite;
          mask-image: linear-gradient(to top, black, transparent 82%);
        }
        .ems-intro-core {
          perspective: 1100px;
          animation: ems-core-in 900ms cubic-bezier(.2,.8,.2,1) both;
        }
        .ems-intro-logo {
          text-shadow: 0 0 18px rgba(34,211,238,.75), 0 0 44px rgba(255,45,146,.45), 0 0 88px rgba(253,224,71,.25);
          animation: ems-logo-pulse 1.8s ease-in-out infinite;
        }
        .ems-intro-orbit {
          transform-style: preserve-3d;
          animation: ems-orbit 5s linear infinite;
          box-shadow: 0 0 44px rgba(34,211,238,.12);
        }
        .ems-intro-orbit-2 { animation-duration: 6.4s; animation-direction: reverse; }
        .ems-intro-orbit-3 { animation-duration: 4.2s; }
        .ems-intro-city { transform: rotateX(58deg) translateZ(-100px); animation: ems-city 2.8s ease-in-out infinite alternate; }
        .ems-intro-launch { animation: ems-launch 2.65s cubic-bezier(.18,.8,.22,1) forwards; }
        @keyframes ems-stars { from { transform: translate3d(0,0,0); } to { transform: translate3d(-120px, 120px, 0); } }
        @keyframes ems-grid { from { background-position: 0 0; } to { background-position: 0 72px; } }
        @keyframes ems-core-in { from { opacity: 0; transform: translateY(24px) scale(.92) rotateX(12deg); } to { opacity: 1; transform: translateY(0) scale(1) rotateX(0); } }
        @keyframes ems-logo-pulse { 0%,100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.035); filter: brightness(1.35); } }
        @keyframes ems-orbit { from { transform: rotateX(68deg) rotateZ(0deg); } to { transform: rotateX(68deg) rotateZ(360deg); } }
        @keyframes ems-city { from { opacity: .55; transform: rotateX(58deg) translateZ(-120px) translateY(8px); } to { opacity: .95; transform: rotateX(58deg) translateZ(-70px) translateY(-6px); } }
        @keyframes ems-launch { 0% { transform: scale(1) translateY(0); opacity: 1; } 45% { transform: scale(1.06) translateY(-8px); opacity: 1; } 100% { transform: scale(2.2) translateY(-42px); opacity: 0; filter: blur(16px); } }
      `}</style>
    </div>
  );
}

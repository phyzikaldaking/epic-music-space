"use client";

import { useEffect, useMemo, useState } from "react";

type CheckStatus = "pass" | "warn" | "fail";
type Check = { label: string; status: CheckStatus; detail: string; action?: string };

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function badge(status: CheckStatus) {
  if (status === "pass") return "bg-green-400 text-black";
  if (status === "warn") return "bg-yellow-300 text-black";
  return "bg-red-500 text-black";
}

export default function StudioReadinessPanel() {
  const [online, setOnline] = useState(true);
  const [storageWorks, setStorageWorks] = useState(false);
  const [micPermission, setMicPermission] = useState<PermissionState | "unknown">("unknown");
  const [lastChecked, setLastChecked] = useState<string>("");

  useEffect(() => {
    function refreshOnline() {
      setOnline(navigator.onLine);
    }
    refreshOnline();
    window.addEventListener("online", refreshOnline);
    window.addEventListener("offline", refreshOnline);
    return () => {
      window.removeEventListener("online", refreshOnline);
      window.removeEventListener("offline", refreshOnline);
    };
  }, []);

  async function runChecks() {
    try {
      const key = "ems.production.readiness.test";
      localStorage.setItem(key, new Date().toISOString());
      setStorageWorks(Boolean(localStorage.getItem(key)));
      localStorage.removeItem(key);
    } catch {
      setStorageWorks(false);
    }

    try {
      if (navigator.permissions?.query) {
        const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
        setMicPermission(result.state);
      } else {
        setMicPermission("unknown");
      }
    } catch {
      setMicPermission("unknown");
    }

    setOnline(navigator.onLine);
    setLastChecked(new Date().toLocaleTimeString());
  }

  useEffect(() => {
    void runChecks();
  }, []);

  const checks = useMemo<Check[]>(() => {
    const audioContext = typeof window !== "undefined" && Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    const mediaRecorder = typeof window !== "undefined" && "MediaRecorder" in window;
    const mediaDevices = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    const secure = typeof window !== "undefined" && window.isSecureContext;
    const fileApi = typeof window !== "undefined" && "File" in window && "Blob" in window && "URL" in window;

    return [
      { label: "Fullscreen studio shell", status: "pass", detail: "Studio route runs as an app surface with DAW, Beat, Export, Mix, and Files areas.", action: "Keep global marketing chrome out of /studio/try." },
      { label: "Audio decode engine", status: audioContext ? "pass" : "fail", detail: audioContext ? "Browser supports AudioContext for decoded waveforms." : "AudioContext missing, so import/waveforms will fail.", action: "Block unsupported browsers or show a browser upgrade notice." },
      { label: "Recording engine", status: mediaRecorder && mediaDevices && secure ? "pass" : "fail", detail: mediaRecorder && mediaDevices && secure ? "Mic recording APIs are available." : "Mic recording needs HTTPS, MediaRecorder, and getUserMedia.", action: "Keep the current mic warning and require HTTPS." },
      { label: "Input permission", status: micPermission === "denied" ? "fail" : micPermission === "granted" ? "pass" : "warn", detail: micPermission === "granted" ? "Microphone permission is granted." : micPermission === "denied" ? "Microphone is blocked by the browser." : "Microphone permission has not been granted yet.", action: "Use the Input Meter or Record button to request access." },
      { label: "Local recovery", status: storageWorks ? "pass" : "fail", detail: storageWorks ? "Local browser save/recovery is available." : "Local storage failed or is blocked.", action: "For production, add server-backed save in Supabase." },
      { label: "Network state", status: online ? "pass" : "warn", detail: online ? "Browser is online." : "Browser is offline; local work may continue but cloud features cannot sync.", action: "Keep offline warnings visible in Studio." },
      { label: "File APIs", status: fileApi ? "pass" : "fail", detail: fileApi ? "Import/export Blob and File APIs are present." : "Browser file APIs are missing.", action: "Block unsupported browsers." },
      { label: "Cloud session persistence", status: "warn", detail: "Current workflow saves metadata locally. Production needs Supabase sessions, tracks, clips, versions, and storage paths.", action: "Wire Supabase Storage and tables before paid/public launch." },
      { label: "Collaboration", status: "warn", detail: "Private links, invite roles, editor locks, comments, and presence are not fully server-backed yet.", action: "Add role-based collaboration before multi-user release." },
      { label: "True mixdown export", status: "warn", detail: "Clip downloads and archive export work. Full rendered WAV/MP3 mixdown still needs offline Web Audio rendering.", action: "Add OfflineAudioContext mixdown renderer." },
    ];
  }, [micPermission, online, storageWorks]);

  const passCount = checks.filter((check) => check.status === "pass").length;
  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const readiness = Math.round((passCount / checks.length) * 100);

  return (
    <main className="h-dvh overflow-auto bg-[#101319] px-6 py-16 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-white/10 bg-[#171b22] p-6 shadow-[0_24px_80px_rgba(0,0,0,.45)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Production readiness</p>
              <h2 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] text-white">Studio launch checklist</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
                This panel surfaces what is ready, what is browser-dependent, and what still needs real backend infrastructure before the studio should be considered production-ready.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/45 px-5 py-4 text-right">
              <p className="text-4xl font-black text-cyan-200">{readiness}%</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/45">local readiness</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-4"><b className="text-2xl text-green-300">{passCount}</b><p className="text-xs uppercase tracking-widest text-white/50">passing</p></div>
            <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4"><b className="text-2xl text-yellow-200">{warnCount}</b><p className="text-xs uppercase tracking-widest text-white/50">needs backend/product work</p></div>
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4"><b className="text-2xl text-red-300">{failCount}</b><p className="text-xs uppercase tracking-widest text-white/50">blocking in this browser</p></div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={() => void runChecks()} className="rounded-full bg-cyan-300 px-5 py-2 text-xs font-black uppercase tracking-widest text-black">Run checks</button>
            <span className="text-xs uppercase tracking-widest text-white/40">Last checked: {lastChecked || "not yet"}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {checks.map((check) => (
            <article key={check.label} className="rounded-2xl border border-white/10 bg-[#181c23] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.14em] text-white">{check.label}</h3>
                  <p className="mt-2 text-sm text-white/60">{check.detail}</p>
                  {check.action && <p className="mt-2 text-xs uppercase tracking-widest text-cyan-100/70">Next: {check.action}</p>}
                </div>
                <span className={cn("rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest", badge(check.status))}>{check.status}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-5 text-sm leading-6 text-yellow-50">
          <b className="block uppercase tracking-widest text-yellow-200">Hard truth</b>
          The studio can be a strong interactive demo now, but the real production line is server-backed sessions, durable audio storage, rendered mixdown export, collaboration roles, and automated browser tests. Those are the items that separate a demo from a launch-safe DAW.
        </div>
      </section>
    </main>
  );
}

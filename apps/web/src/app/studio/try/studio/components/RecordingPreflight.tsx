"use client";

import { useEffect, useRef, useState } from "react";
import { classifyInputSignal, getPreflightChecklist, type InputSignalStatus, type PreflightPermission } from "../preflight";
import { InputMeter } from "./InputMeter";

export function RecordingPreflight({ onReady, onClose }: { onReady: () => void; onClose: () => void }) {
  const [permission, setPermission] = useState<PreflightPermission>("unknown");
  const [signal, setSignal] = useState<InputSignalStatus>("silent");
  const [peakDb, setPeakDb] = useState(-Infinity);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
  const checklist = getPreflightChecklist({ supported, permission, signal });

  function stopCheck() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => stopCheck, []);

  async function checkInput() {
    if (!supported) return setError("This browser cannot record audio. Use current Chrome, Safari, or Firefox on a device with a microphone.");
    stopCheck(); setChecking(true); setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream; setPermission("granted");
      const context = new AudioContext();
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const read = () => { analyser.getFloatTimeDomainData(samples); const result = classifyInputSignal(samples); setSignal(result.status); setPeakDb(result.peakDb); frameRef.current = requestAnimationFrame(read); };
      read();
    } catch (reason) {
      setPermission("denied"); setError(reason instanceof Error ? reason.message : "Microphone access was not granted.");
    } finally { setChecking(false); }
  }

  function continueToRecord() { stopCheck(); onReady(); }

  return <div className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="preflight-title">
    <div className="studio-modal__panel preflight-panel">
      <button className="studio-modal__close" onClick={() => { stopCheck(); onClose(); }} aria-label="Close recording setup">×</button>
      <span className="studio-kicker">RECORDING SETUP</span><h2 id="preflight-title">Check the room before the take.</h2>
      <p>Studio checks browser support, microphone permission, and signal level. Monitoring stays off to prevent echo.</p>
      <div className="preflight-list">{checklist.map((item) => <div key={item.id} className={`is-${item.status}`}><i>{item.status === "pass" ? "✓" : item.status === "warn" ? "!" : item.status === "fail" ? "×" : "·"}</i><span>{item.label}</span><b>{item.status}</b></div>)}</div>
      {permission === "granted" && <><InputMeter peakDb={peakDb} clipping={signal === "clipping"}/><p className="preflight-reading">{signal === "healthy" ? "Signal looks healthy." : signal === "clipping" ? "Input is clipping—lower the microphone gain." : "Speak or play into the selected microphone."}</p></>}
      {error && <p className="preflight-error" role="alert">{error}</p>}
      <div className="preflight-actions"><button className="studio-secondary" onClick={() => void checkInput()} disabled={checking}>{checking ? "Checking…" : permission === "granted" ? "Check again" : "Check microphone"}</button><button className="studio-primary" onClick={continueToRecord} disabled={permission !== "granted" || signal === "silent"}>{signal === "clipping" ? "Continue with warning" : "Ready to record"}</button></div>
    </div>
  </div>;
}

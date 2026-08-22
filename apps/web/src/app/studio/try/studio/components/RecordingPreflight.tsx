"use client";

import { useEffect, useRef, useState } from "react";
import { classifyInputSignal, getPreflightChecklist, type InputSignalStatus, type PreflightPermission } from "../preflight";
import type { RecordingDeviceSelection, RecordingLatencyProfile } from "../recording";
import { buildRecordingConstraints, listRecordingDevices, measureLatencyProfile, resolvePreferredDevice, type RecordingDeviceInventory } from "../recordingDevices";
import { createRecordingGraph } from "../recordingGraph";
import { InputMeter } from "./InputMeter";

export type RecordingPreflightResult = {
  device: RecordingDeviceSelection;
  latency: RecordingLatencyProfile;
  monitoring: { enabled: boolean; headphonesConfirmed: boolean; gain: number };
  countInBars: 1 | 2 | 4;
};

export function RecordingPreflight({ onReady, onClose, initialDevice }: { onReady: (result: RecordingPreflightResult) => void; onClose: () => void; initialDevice?: RecordingDeviceSelection }) {
  const [permission, setPermission] = useState<PreflightPermission>("unknown");
  const [signal, setSignal] = useState<InputSignalStatus>("silent");
  const [peakDb, setPeakDb] = useState(-Infinity);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [inventory, setInventory] = useState<RecordingDeviceInventory | null>(null);
  const [device, setDevice] = useState<RecordingDeviceSelection>(initialDevice ?? { inputDeviceId: "default", channelCount: 1 });
  const [latency, setLatency] = useState<RecordingLatencyProfile>({ inputMs: 0, outputMs: 0, baseMs: 0, measuredAt: new Date(0).toISOString() });
  const [monitoring, setMonitoring] = useState(false);
  const [headphonesConfirmed, setHeadphonesConfirmed] = useState(false);
  const [monitorGain, setMonitorGain] = useState(.65);
  const [monitorWarning, setMonitorWarning] = useState<string | null>(null);
  const [countInBars, setCountInBars] = useState<1 | 2 | 4>(1);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<ReturnType<typeof createRecordingGraph> | null>(null);
  const frameRef = useRef<number | null>(null);
  const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
  const checklist = getPreflightChecklist({ supported, permission, signal });

  function stopCheck() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    graphRef.current?.dispose(); graphRef.current = null;
    if (contextRef.current?.state !== "closed") void contextRef.current?.close();
    contextRef.current = null;
  }

  useEffect(() => stopCheck, []);

  async function checkInput() {
    if (!supported) return setError("This browser cannot record audio. Use current Chrome, Safari, or Firefox on a device with a microphone.");
    stopCheck(); setChecking(true); setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(buildRecordingConstraints(device));
      streamRef.current = stream; setPermission("granted");
      const context = new AudioContext();
      contextRef.current = context;
      const graph = createRecordingGraph(context, stream); graphRef.current = graph;
      const analyser = graph.analyser;
      const nextInventory = await listRecordingDevices(navigator.mediaDevices);
      setInventory(nextInventory);
      setDevice((current) => resolvePreferredDevice(current, nextInventory));
      setLatency(measureLatencyProfile(context, stream.getAudioTracks()[0]?.getSettings() as { latency?: number }));
      const samples = new Float32Array(analyser.fftSize);
      const read = () => { analyser.getFloatTimeDomainData(samples); const result = classifyInputSignal(samples); setSignal(result.status); setPeakDb(result.peakDb); frameRef.current = requestAnimationFrame(read); };
      read();
    } catch (reason) {
      setPermission("denied"); setError(reason instanceof Error ? reason.message : "Microphone access was not granted.");
    } finally { setChecking(false); }
  }

  function updateMonitoring(enabled: boolean, confirmed = headphonesConfirmed, gain = monitorGain) {
    setMonitoring(enabled); setHeadphonesConfirmed(confirmed); setMonitorGain(gain);
    setMonitorWarning(graphRef.current?.setMonitoring({ enabled, headphonesConfirmed: confirmed, gain }).warning ?? null);
  }

  function continueToRecord() {
    const result = { device, latency, monitoring: { enabled: monitoring, headphonesConfirmed, gain: monitorGain }, countInBars };
    stopCheck(); onReady(result);
  }

  return <div className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="preflight-title">
    <div className="studio-modal__panel preflight-panel">
      <button className="studio-modal__close" onClick={() => { stopCheck(); onClose(); }} aria-label="Close recording setup">×</button>
      <span className="studio-kicker">RECORDING SETUP</span><h2 id="preflight-title">Check the room before the take.</h2>
      <p>Studio checks browser support, microphone permission, and signal level. Monitoring stays off to prevent echo.</p>
      <div className="preflight-list">{checklist.map((item) => <div key={item.id} className={`is-${item.status}`}><i>{item.status === "pass" ? "✓" : item.status === "warn" ? "!" : item.status === "fail" ? "×" : "·"}</i><span>{item.label}</span><b>{item.status}</b></div>)}</div>
      {inventory && <div className="preflight-device-grid">
        <label>Input<select aria-label="Recording input" value={device.inputDeviceId} onChange={(event) => setDevice((current) => ({ ...current, inputDeviceId: event.target.value }))}>{inventory.inputs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Output<select aria-label="Monitoring output" value={device.outputDeviceId ?? ""} onChange={(event) => setDevice((current) => ({ ...current, outputDeviceId: event.target.value || undefined }))} disabled={!inventory.canSelectOutput}><option value="">System default</option>{inventory.outputs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Channels<select aria-label="Recording channels" value={device.channelCount} onChange={(event) => setDevice((current) => ({ ...current, channelCount: Number(event.target.value) === 2 ? 2 : 1 }))}><option value="1">Mono</option><option value="2">Stereo</option></select></label>
        <label>Count-in<select aria-label="Count-in bars" value={countInBars} onChange={(event) => setCountInBars(Number(event.target.value) as 1 | 2 | 4)}><option value="1">1 bar</option><option value="2">2 bars</option><option value="4">4 bars</option></select></label>
      </div>}
      {permission === "granted" && <><InputMeter peakDb={peakDb} clipping={signal === "clipping"}/><p className="preflight-reading">{signal === "healthy" ? "Signal looks healthy." : signal === "clipping" ? "Input is clipping—lower the microphone gain." : "Speak or play into the selected microphone."}</p></>}
      {permission === "granted" && <div className="preflight-monitoring"><label><input type="checkbox" checked={headphonesConfirmed} onChange={(event) => updateMonitoring(monitoring, event.target.checked)} /> I am using headphones</label><label><input type="checkbox" checked={monitoring} onChange={(event) => updateMonitoring(event.target.checked)} /> Monitor input</label><label>Monitor level<input aria-label="Monitor level" type="range" min="0" max="1" step="0.05" value={monitorGain} onChange={(event) => updateMonitoring(monitoring, headphonesConfirmed, Number(event.target.value))} /></label><small>Estimated round trip: {Math.round(latency.inputMs + latency.outputMs + latency.baseMs)} ms</small></div>}
      {monitorWarning && <p className="preflight-error" role="alert">{monitorWarning}</p>}
      {error && <p className="preflight-error" role="alert">{error}</p>}
      <div className="preflight-actions"><button className="studio-secondary" onClick={() => void checkInput()} disabled={checking}>{checking ? "Checking…" : permission === "granted" ? "Check again" : "Check microphone"}</button><button className="studio-primary" onClick={continueToRecord} disabled={permission !== "granted" || signal === "silent"}>{signal === "clipping" ? "Continue with warning" : "Ready to record"}</button></div>
    </div>
  </div>;
}

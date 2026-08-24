"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_OFFICIAL_BEAT_MACHINE_KIT_ID,
  loadOfficialKitBrowser,
  type OfficialKitAssetUrlOptions,
  type OfficialKitBrowserKit,
  type OfficialKitBrowserModel,
  type OfficialKitBrowserSample,
} from "@/lib/officialKits/beatMachine";
import { OFFICIAL_KIT_MANIFEST, type OfficialKitLane } from "@/lib/officialKits";

interface OfficialKitBrowserProps extends OfficialKitAssetUrlOptions {
  /** Lets the published app fetch a storage-backed manifest without making
   * this browser depend on a particular backend or credential. */
  loadManifest?: () => Promise<unknown>;
  manifest?: unknown;
  onKitChange?: (kit: OfficialKitBrowserKit) => void;
}

type BrowserState =
  | { phase: "loading" }
  | { phase: "ready"; model: OfficialKitBrowserModel };

const LANE_LABELS: Record<OfficialKitLane, string> = {
  kick: "Kick",
  bass808: "808",
  snare: "Snare",
  clap: "Clap",
  hat: "Hat",
  perc: "Perc",
  vox: "Vox",
  fx: "FX",
};

export function OfficialKitBrowser({ getAssetUrl, loadManifest, manifest = OFFICIAL_KIT_MANIFEST, onKitChange }: OfficialKitBrowserProps) {
  const [state, setState] = useState<BrowserState>({ phase: "loading" });
  const [selectedKitId, setSelectedKitId] = useState<string>(DEFAULT_OFFICIAL_BEAT_MACHINE_KIT_ID);
  const [selectedLane, setSelectedLane] = useState<OfficialKitLane>("kick");
  const [previewState, setPreviewState] = useState<string | null>(null);
  const previewAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const input = loadManifest ? await loadManifest() : manifest;
        if (!active) return;
        const model = loadOfficialKitBrowser(input, { getAssetUrl });
        setState({ phase: "ready", model });
        setSelectedKitId(model.selectedKitId);
        const defaultKit = model.kits.find((kit) => kit.id === model.selectedKitId);
        if (defaultKit) onKitChange?.(defaultKit);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Unable to load official kits";
        const model = loadOfficialKitBrowser({ invalid: true }, { getAssetUrl });
        setState({ phase: "ready", model: { ...model, error: message } });
        setSelectedKitId(model.selectedKitId);
        const defaultKit = model.kits.find((kit) => kit.id === model.selectedKitId);
        if (defaultKit) onKitChange?.(defaultKit);
      }
    }
    void load();
    return () => {
      active = false;
      previewAudio.current?.pause();
      previewAudio.current = null;
    };
  }, [getAssetUrl, loadManifest, manifest, onKitChange]);

  const activeKit = useMemo(() => state.phase === "ready" ? state.model.kits.find((kit) => kit.id === selectedKitId) ?? state.model.kits[0] : undefined, [selectedKitId, state]);
  const samples = activeKit?.lanes[selectedLane] ?? [];

  function selectKit(kitId: string) {
    setSelectedKitId(kitId);
    const kit = state.phase === "ready" ? state.model.kits.find((candidate) => candidate.id === kitId) : undefined;
    if (kit) onKitChange?.(kit);
  }

  function preview(sample: OfficialKitBrowserSample) {
    if (!sample.url) {
      setPreviewState("This sample is ready for preview once its published asset URL is configured.");
      return;
    }
    previewAudio.current?.pause();
    const audio = new Audio(sample.url);
    previewAudio.current = audio;
    audio.onended = () => setPreviewState(null);
    audio.onerror = () => setPreviewState(`Could not preview ${sample.lane}; the sequencer remains available.`);
    void audio.play().then(() => setPreviewState(`Previewing ${sample.lane} ${sample.variant}.`)).catch(() => setPreviewState(`Could not start ${sample.lane} preview; check the published asset URL.`));
  }

  if (state.phase === "loading") {
    return <section className="border-b border-cyan-200/20 bg-[#101419] px-4 py-3 text-sm text-cyan-100" aria-busy="true" aria-live="polite">Loading official EMS kits…</section>;
  }

  const { model } = state;
  if (model.kits.length === 0 || !activeKit) {
    return <section className="border-b border-yellow-200/20 bg-[#17130c] px-4 py-3 text-sm text-yellow-100" role="status">No official kits are available yet. The Beat Machine is still ready to use.</section>;
  }

  return <section className="border-b border-cyan-200/20 bg-[#101419] px-3 py-3 text-white sm:px-4" aria-label="Official EMS kit browser">
    <div className="mx-auto grid max-w-[1900px] gap-3 xl:grid-cols-[minmax(270px,.75fr)_minmax(0,1fr)_minmax(300px,.85fr)]">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-100/70">Official EMS kits</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="official-kit-selection">{model.labels.kitSelect}</label>
          <select id="official-kit-selection" aria-label={model.labels.kitSelect} value={activeKit.id} onChange={(event) => selectKit(event.target.value)} className="min-w-[190px] rounded border border-cyan-200/30 bg-black px-3 py-2 text-sm font-black text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
            {model.kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}
          </select>
          <span className="rounded-full border border-white/15 px-2 py-1 text-[10px] font-bold uppercase text-white/65">{activeKit.genre}</span>
        </div>
        <p className="mt-2 max-w-xl text-xs leading-5 text-white/60">{activeKit.description}</p>
        <p className="mt-2 text-[11px] font-semibold text-cyan-100">Phyzikal Knock starter pattern is ready in the sequencer for first run.</p>
      </div>

      <div className="flex flex-wrap content-start gap-1.5" role="group" aria-label="Official kit lanes">
        {(Object.keys(LANE_LABELS) as OfficialKitLane[]).map((lane) => <button key={lane} type="button" aria-pressed={selectedLane === lane} aria-label={model.labels.lane(lane)} onClick={() => setSelectedLane(lane)} className={`rounded border px-2.5 py-2 text-[10px] font-black uppercase tracking-wider focus-visible:ring-2 focus-visible:ring-cyan-200 ${selectedLane === lane ? "border-cyan-200 bg-cyan-200 text-black" : "border-white/15 bg-white/[.03] text-white/70 hover:text-white"}`}>{LANE_LABELS[lane]}</button>)}
      </div>

      <div className="min-w-0 rounded border border-white/10 bg-black/30 p-2" aria-label={`${LANE_LABELS[selectedLane]} sample options`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/55">{LANE_LABELS[selectedLane]} samples</p>
          <span className="text-[10px] text-white/40">{samples.length} choices</span>
        </div>
        {samples.length === 0 ? <p className="py-3 text-xs text-white/55">No samples are published for this lane yet.</p> : <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{samples.map((sample) => <article key={sample.assetId} className="min-w-[170px] rounded border border-white/10 bg-white/[.035] p-2">
          <p className="text-[11px] font-black uppercase text-white">{sample.variant}</p>
          <p className="mt-1 text-[10px] text-cyan-100/85">{sample.sourceKindLabel}</p>
          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/50">{sample.provenanceLabel}</p>
          <button type="button" aria-label={model.labels.preview(sample)} onClick={() => preview(sample)} className="mt-2 w-full rounded border border-cyan-200/35 bg-cyan-200/10 px-2 py-1.5 text-[10px] font-black uppercase text-cyan-100 hover:bg-cyan-200/20 focus-visible:ring-2 focus-visible:ring-cyan-200">Preview</button>
        </article>)}</div>}
      </div>
    </div>
    {model.status === "fallback" ? <p className="mx-auto mt-2 max-w-[1900px] text-xs text-yellow-100" role="status">Official kit data could not be refreshed. Showing the verified Phyzikal Knock fallback. {model.error}</p> : null}
    {previewState ? <p className="sr-only" aria-live="polite">{previewState}</p> : null}
  </section>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  usePluginBridge,
  listPlugins,
  instantiatePlugin,
  removePluginInstance,
} from "@/lib/pluginBridge/client";
import type { PluginSlot } from "@/components/daw/dawEngine";

// Per-track external plugin chain (#plugins). Renders the saved
// plugin slots, a "+ add plugin" button that opens the catalog modal,
// and a tiny status chip when the host isn't connected. The actual
// DSP runs in the EMS Plugin Host desktop app — the browser only
// shows slot order, bypass state, and a placeholder for parameter
// editing (a full GUI per plugin is out of scope; producers can use
// the plugin's own window if they need it).

interface Props {
  trackId: string;
  slots: PluginSlot[];
  onAddSlot: (slot: Omit<PluginSlot, "slotId">) => string;
  onUpdateSlot: (slotId: string, patch: Partial<PluginSlot>) => void;
  onRemoveSlot: (slotId: string) => void;
  onMoveSlot: (slotId: string, delta: -1 | 1) => void;
}

export default function PluginChain({
  trackId,
  slots,
  onAddSlot,
  onUpdateSlot,
  onRemoveSlot,
  onMoveSlot,
}: Props) {
  const bridge = usePluginBridge();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const connected = bridge.status === "connected";
  const installPrompt =
    bridge.status === "disconnected"
      ? "Install the EMS Plugin Host app to use VST3/AU plugins from your existing licenses."
      : bridge.status === "unsupported"
        ? "Your OS doesn't support plugin scanning yet."
        : bridge.status === "rejected"
          ? bridge.error ?? "Plugin host rejected the connection."
          : null;

  async function handlePick(pluginId: string) {
    const entry = bridge.catalog.find((p) => p.id === pluginId);
    if (!entry) return;
    // Optimistic: add the slot locally first so the chain re-renders.
    // When the host returns the live handle, we bind it via update.
    const slotId = onAddSlot({
      pluginId: entry.id,
      vendor: entry.vendor,
      name: entry.name,
      instanceHandle: null,
      parameterValues: {},
      bypassed: false,
    });
    setCatalogOpen(false);
    if (connected) {
      const instance = await instantiatePlugin(pluginId, trackId);
      if (instance) {
        const initialValues: Record<string, number> = {};
        for (const p of instance.parameters) {
          initialValues[p.id] = p.value;
        }
        onUpdateSlot(slotId, {
          instanceHandle: instance.instanceHandle,
          parameterValues: initialValues,
        });
      }
    }
  }

  function handleRemove(slot: PluginSlot) {
    if (slot.instanceHandle) {
      removePluginInstance(slot.instanceHandle);
    }
    onRemoveSlot(slot.slotId);
  }

  function handleBypass(slot: PluginSlot) {
    onUpdateSlot(slot.slotId, { bypassed: !slot.bypassed });
    // Future: dispatch a bridge-side bypass message so the host
    // skips the plugin in the DSP graph. Until the audio channel is
    // live, the slot's bypassed flag is purely metadata.
  }

  return (
    <div className="rounded-md border border-violet-400/25 bg-violet-500/[0.05] px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-200">
          Plugins
        </p>
        <BridgeStatusChip />
      </div>

      {installPrompt && slots.length === 0 && (
        <p className="rounded border border-violet-400/25 bg-black/30 p-2 text-[11px] text-white/65">
          {installPrompt}{" "}
          {bridge.status === "disconnected" && (
            <Link
              href="/studio/plugin-host"
              className="text-violet-200 underline"
            >
              Download host →
            </Link>
          )}
        </p>
      )}

      {slots.length > 0 && (
        <ul className="space-y-1">
          {slots.map((slot, idx) => {
            const isPending = !slot.instanceHandle && connected;
            const isOrphan = !slot.instanceHandle && !connected;
            const params = bridge.catalog.find((p) => p.id === slot.pluginId);
            return (
              <li
                key={slot.slotId}
                className={`flex flex-wrap items-center gap-1.5 rounded border px-2 py-1 ${
                  slot.bypassed
                    ? "border-white/10 bg-white/[0.02] opacity-50"
                    : "border-violet-400/30 bg-violet-500/[0.06]"
                }`}
              >
                <span className="rounded bg-violet-500/30 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-violet-100">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold text-white/95">
                    {slot.vendor} · {slot.name}
                  </p>
                  {isPending && (
                    <p className="text-[9px] text-amber-200">Instantiating…</p>
                  )}
                  {isOrphan && (
                    <p className="text-[9px] text-rose-200">
                      Host offline — params saved, will rebind when host returns.
                    </p>
                  )}
                  {!isPending && !isOrphan && params && params.latencySamples > 0 && (
                    <p className="text-[9px] text-white/40">
                      {params.latencySamples} samp latency
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onMoveSlot(slot.slotId, -1)}
                  disabled={idx === 0}
                  className="rounded border border-white/15 px-1 text-[10px] text-white/55 hover:bg-white/10 disabled:opacity-30"
                  aria-label="Move plugin up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSlot(slot.slotId, 1)}
                  disabled={idx === slots.length - 1}
                  className="rounded border border-white/15 px-1 text-[10px] text-white/55 hover:bg-white/10 disabled:opacity-30"
                  aria-label="Move plugin down"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => handleBypass(slot)}
                  className={`rounded border px-1.5 text-[9px] font-bold uppercase tracking-widest transition ${
                    slot.bypassed
                      ? "border-white/15 text-white/55"
                      : "border-emerald-300/45 bg-emerald-500/15 text-emerald-100"
                  }`}
                  aria-label={slot.bypassed ? "Enable plugin" : "Bypass plugin"}
                >
                  {slot.bypassed ? "Off" : "On"}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(slot)}
                  className="rounded border border-rose-400/35 px-1.5 text-[10px] text-rose-200 hover:bg-rose-500/15"
                  aria-label="Remove plugin"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          setCatalogOpen(true);
          if (connected) void listPlugins();
        }}
        disabled={!connected}
        className="mt-2 w-full rounded border border-violet-400/35 bg-violet-500/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-100 transition hover:bg-violet-500/20 disabled:opacity-40"
      >
        {connected ? "+ Add plugin" : "+ Add plugin (host offline)"}
      </button>

      {catalogOpen && connected && (
        <PluginCatalogModal
          onClose={() => setCatalogOpen(false)}
          onPick={handlePick}
          filter={filter}
          onFilter={setFilter}
        />
      )}
    </div>
  );
}

function BridgeStatusChip() {
  const bridge = usePluginBridge();
  const tone =
    bridge.status === "connected"
      ? "bg-emerald-500/25 text-emerald-100"
      : bridge.status === "connecting"
        ? "bg-amber-500/25 text-amber-100"
        : "bg-white/10 text-white/55";
  const label =
    bridge.status === "connected"
      ? `Host v${bridge.hostVersion ?? "?"}`
      : bridge.status === "connecting"
        ? "Connecting…"
        : bridge.status === "unsupported"
          ? "Unsupported OS"
          : bridge.status === "rejected"
            ? "Version mismatch"
            : "Host offline";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${tone}`}
      title={
        bridge.status === "connected"
          ? `Connected to EMS Plugin Host v${bridge.hostVersion ?? "?"} (${bridge.catalog.length} plugins)`
          : "EMS Plugin Host not running. Install + launch to use external plugins."
      }
    >
      {label}
    </span>
  );
}

function PluginCatalogModal({
  onClose,
  onPick,
  filter,
  onFilter,
}: {
  onClose: () => void;
  onPick: (id: string) => void;
  filter: string;
  onFilter: (v: string) => void;
}) {
  const bridge = usePluginBridge();
  const filtered = bridge.catalog.filter((p) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.vendor.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Browse installed plugins"
      className="fixed inset-0 z-[181] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(640px,100%)] max-h-[80vh] overflow-y-auto rounded-2xl border border-violet-400/40 bg-[#0a0a10]/95 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-300">
              Plugins · catalog
            </p>
            <h2 className="mt-1 font-display text-lg uppercase tracking-wide text-white">
              Installed on your computer
            </h2>
            <p className="mt-1 text-xs text-white/55">
              Scanned by the EMS Plugin Host. UAD, Waves, Antares, iZotope —
              anything you&apos;ve already authorized.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/65 hover:bg-white/10"
          >
            Close
          </button>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="Filter — name, vendor, category"
          className="mt-4 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
          autoFocus
        />
        <ul className="mt-3 space-y-1">
          {filtered.length === 0 && (
            <p className="rounded border border-dashed border-white/15 px-3 py-2 text-xs text-white/45">
              No plugins match the filter. The host scans VST3 / AU on
              macOS, VST3 / VST2 on Windows.
            </p>
          )}
          {filtered.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded border px-2.5 py-1.5 transition ${
                p.authorized
                  ? "border-white/10 bg-white/[0.02] hover:border-violet-400/40 hover:bg-violet-500/[0.06]"
                  : "border-rose-400/25 bg-rose-500/[0.04] opacity-70"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white/95">
                  {p.vendor} · {p.name}
                </p>
                <p className="truncate text-[10px] uppercase tracking-widest text-white/45">
                  {p.format} · {p.category}
                  {p.latencySamples > 0 ? ` · ${p.latencySamples} samp` : ""}
                </p>
                {!p.authorized && (
                  <p className="text-[10px] text-rose-200">
                    Not authorized — open your plugin manager.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                disabled={!p.authorized}
                className="rounded-md border border-violet-300/45 bg-violet-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-violet-100 hover:bg-violet-500/25 disabled:opacity-40"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

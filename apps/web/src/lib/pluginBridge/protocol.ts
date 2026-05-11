// Plugin Bridge protocol v1.
//
// The browser can't load VST3/AU plugins directly — Web Audio runs in a
// sandboxed worklet and there's no path to execute native plugin code.
// To give producers their real Waves / UAD / Antares / iZotope chains,
// we shipa companion desktop app ("EMS Plugin Host") they install once.
// The host scans their OS for installed VST3/AU/AAX plugins, exposes
// them over a localhost WebSocket, and runs the actual DSP. The browser
// streams audio in, params out, and renders the GUI as a parameter list.
//
// This file is the wire contract. Both sides parse against these types.
// The desktop host repo is /tools/plugin-host (separate codebase).

export const BRIDGE_PROTOCOL_VERSION = 1;
export const BRIDGE_DEFAULT_PORT = 5544;
export const BRIDGE_WS_URL = `ws://127.0.0.1:${BRIDGE_DEFAULT_PORT}`;

/** Stable identifier for an installed plugin. Format: "vendor:name:format"
 *  e.g. "Waves:CLA-76:VST3", "Antares:Auto-Tune Pro:AU", "iZotope:
 *  Nectar 4:VST3". Identifiers are vendor-stable so a project saved
 *  on one machine round-trips on another machine that has the same
 *  plugins installed. */
export type PluginId = string;

export type PluginFormat = "VST3" | "AU" | "AAX" | "CLAP";

export interface PluginCatalogEntry {
  id: PluginId;
  vendor: string;
  name: string;
  format: PluginFormat;
  /** Lowercased category for filtering: "eq", "compressor",
   *  "saturation", "reverb", "delay", "vocal", "synth", "other". */
  category: string;
  /** True if the plugin reports as authorized (license check passed
   *  in the host). False entries are still listed but render disabled
   *  in the browser UI with an "Authorize in your plugin manager"
   *  hint. */
  authorized: boolean;
  /** Latency in samples the plugin introduces. Studio reads this so it
   *  can compensate input-monitoring delay when recording through
   *  the plugin. 0 = zero-latency. */
  latencySamples: number;
}

export interface PluginParameter {
  /** Parameter ID stable within a plugin instance. */
  id: string;
  /** Human label, e.g. "Threshold", "Mix", "Gain". */
  label: string;
  /** Numeric range. Most plugins normalize 0..1; some expose dB or Hz. */
  min: number;
  max: number;
  /** Step size (granularity). 0 = continuous. */
  step: number;
  /** Current value. */
  value: number;
  /** Display unit, e.g. "dB", "Hz", "ms", "%". Empty for unitless. */
  unit: string;
  /** Optional preset list of named choices (enum params). */
  choices?: string[];
}

/** A live plugin instance running in the host. Each track FX chain
 *  references zero or more instances; the host owns the DSP state and
 *  the browser only persists the instance ids + param values. */
export interface PluginInstance {
  /** Unique handle assigned by the host. Browser passes this back for
   *  every param change. */
  instanceHandle: string;
  /** The catalog id this instance was instantiated from. */
  pluginId: PluginId;
  /** Track id in the browser engine. Round-trips so the host can route
   *  audio correctly when multiple tracks share the same plugin. */
  trackId: string;
  parameters: PluginParameter[];
}

// ─────────────────────────────────────────────────────────────────────
// Message protocol — JSON over WebSocket.
// Every message carries a `type` discriminator + a `requestId` for
// request/response correlation. Notifications (server → client, no
// reply expected) use the same envelope without requestId.
// ─────────────────────────────────────────────────────────────────────

interface Envelope {
  type: string;
  /** Opaque correlation id. Browser generates; host echoes in replies. */
  requestId?: string;
}

// Client → host

export interface HelloMessage extends Envelope {
  type: "hello";
  protocolVersion: number;
  /** Browser studio version for support telemetry. */
  clientVersion: string;
}

export interface ListPluginsMessage extends Envelope {
  type: "listPlugins";
}

export interface InstantiateMessage extends Envelope {
  type: "instantiate";
  pluginId: PluginId;
  trackId: string;
}

export interface SetParameterMessage extends Envelope {
  type: "setParameter";
  instanceHandle: string;
  parameterId: string;
  value: number;
}

export interface RemoveInstanceMessage extends Envelope {
  type: "removeInstance";
  instanceHandle: string;
}

export interface SaveStateMessage extends Envelope {
  type: "saveState";
  instanceHandle: string;
}

export interface LoadStateMessage extends Envelope {
  type: "loadState";
  instanceHandle: string;
  /** Base64-encoded plugin state blob — opaque to the browser. */
  state: string;
}

export type ClientMessage =
  | HelloMessage
  | ListPluginsMessage
  | InstantiateMessage
  | SetParameterMessage
  | RemoveInstanceMessage
  | SaveStateMessage
  | LoadStateMessage;

// Host → client

export interface HelloReply extends Envelope {
  type: "hello.reply";
  protocolVersion: number;
  /** Host build version. */
  hostVersion: string;
  /** True if the user's OS supports plugin scanning at all (Linux
   *  builds without lvst2 e.g. would return false). */
  pluginSupportAvailable: boolean;
}

export interface PluginListReply extends Envelope {
  type: "listPlugins.reply";
  plugins: PluginCatalogEntry[];
}

export interface InstantiateReply extends Envelope {
  type: "instantiate.reply";
  instance: PluginInstance;
}

export interface ErrorReply extends Envelope {
  type: "error";
  code:
    | "not_found"
    | "not_authorized"
    | "instantiation_failed"
    | "invalid_request"
    | "protocol_mismatch";
  message: string;
}

export interface ParameterChangedNotification extends Envelope {
  type: "parameterChanged";
  instanceHandle: string;
  parameterId: string;
  value: number;
}

export interface SaveStateReply extends Envelope {
  type: "saveState.reply";
  instanceHandle: string;
  state: string;
}

export type HostMessage =
  | HelloReply
  | PluginListReply
  | InstantiateReply
  | ErrorReply
  | ParameterChangedNotification
  | SaveStateReply;

// ─────────────────────────────────────────────────────────────────────
// Audio transport.
// Per-track audio streams over a separate WebSocket binary channel
// (BRIDGE_DEFAULT_PORT + 1 = 5545) keyed by instance handle. Format:
// 32-bit float, interleaved stereo, sample rate negotiated in hello.
// The browser uses an AudioWorklet to send/receive frames; the host
// runs the plugin in real-time.
//
// In the current build the audio channel is stubbed — only the control
// channel is live. Plugin slots persist their params and the host
// processes silence until the audio channel ships in a follow-up.
// ─────────────────────────────────────────────────────────────────────

export const BRIDGE_AUDIO_PORT = BRIDGE_DEFAULT_PORT + 1;

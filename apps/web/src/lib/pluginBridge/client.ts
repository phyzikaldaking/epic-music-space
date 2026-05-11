"use client";

import { useSyncExternalStore } from "react";
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_WS_URL,
  type ClientMessage,
  type HostMessage,
  type PluginCatalogEntry,
  type PluginInstance,
} from "./protocol";

// Singleton bridge client. Manages the WebSocket connection to the
// localhost plugin host, auto-reconnects on disconnect, and exposes
// a tiny request/response API the studio uses.
//
// Why a singleton: only one WebSocket per browser tab. The host
// keeps a per-connection registry of instance handles so duplicate
// connections would fork state.

export type BridgeStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "unsupported"
  | "rejected";

interface BridgeState {
  status: BridgeStatus;
  catalog: PluginCatalogEntry[];
  /** Last error message surfaced to UI. Cleared on next successful op. */
  error: string | null;
  /** Diagnostic — host build version reported on hello.reply. */
  hostVersion: string | null;
}

const initial: BridgeState = {
  status: "disconnected",
  catalog: [],
  error: null,
  hostVersion: null,
};

let state: BridgeState = initial;
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let helloAttempted = false;
const pendingRequests = new Map<
  string,
  { resolve: (msg: HostMessage) => void; reject: (err: Error) => void }
>();
let requestCounter = 0;

function emit() {
  for (const fn of listeners) fn();
}

function setState(patch: Partial<BridgeState>) {
  state = { ...state, ...patch };
  emit();
}

function nextRequestId(): string {
  requestCounter += 1;
  return `req_${Date.now()}_${requestCounter}`;
}

/** Open the bridge connection. Called lazily on the first studio
 *  interaction; once open, stays open for the tab's lifetime with
 *  exponential-backoff reconnect on drop. */
export function connectBridge(): void {
  if (typeof window === "undefined") return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  setState({ status: "connecting", error: null });
  try {
    ws = new WebSocket(BRIDGE_WS_URL);
  } catch {
    setState({ status: "disconnected" });
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    helloAttempted = true;
    sendRaw({
      type: "hello",
      requestId: nextRequestId(),
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      clientVersion: "ems-web-1",
    });
  };
  ws.onmessage = (event) => {
    let msg: HostMessage;
    try {
      msg = JSON.parse(event.data as string) as HostMessage;
    } catch {
      return;
    }
    handleHostMessage(msg);
  };
  ws.onerror = () => {
    // Most likely: helper app not installed / not running. Treat as
    // "disconnected" rather than "rejected" — the user just needs to
    // start the helper. Don't spam the console with a noisy error.
    if (!helloAttempted) {
      setState({ status: "disconnected" });
    }
  };
  ws.onclose = () => {
    ws = null;
    setState({ status: "disconnected" });
    scheduleReconnect();
  };
}

function handleHostMessage(msg: HostMessage) {
  if (msg.requestId && pendingRequests.has(msg.requestId)) {
    const pending = pendingRequests.get(msg.requestId);
    pendingRequests.delete(msg.requestId);
    if (msg.type === "error") {
      pending?.reject(new Error(msg.message));
    } else {
      pending?.resolve(msg);
    }
    return;
  }
  // Unsolicited notifications.
  switch (msg.type) {
    case "hello.reply": {
      if (msg.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
        setState({
          status: "rejected",
          error: `Plugin host speaks v${msg.protocolVersion}, studio expects v${BRIDGE_PROTOCOL_VERSION}. Update the EMS Plugin Host app.`,
        });
        return;
      }
      setState({
        status: msg.pluginSupportAvailable ? "connected" : "unsupported",
        error: null,
        hostVersion: msg.hostVersion,
      });
      // Auto-scan plugins on first connect so the UI shows a catalog.
      void listPlugins();
      break;
    }
    case "parameterChanged":
      // Forward param-change notifications to anyone listening (track
      // FX panels). Browser side stays read-only here — the panel
      // listens via a dedicated subscribe.
      window.dispatchEvent(
        new CustomEvent("ems:plugin-bridge:param", { detail: msg }),
      );
      break;
    default:
      break;
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  // 10s reconnect — gives the user time to launch the helper without
  // hammering localhost. We don't escalate to longer waits because the
  // happy path is "user just opened the helper, browser sees it in
  // <10s."
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectBridge();
  }, 10_000);
}

function sendRaw(message: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

function request<T extends HostMessage>(
  message: Omit<ClientMessage, "requestId"> | { type: string; [k: string]: unknown },
  timeoutMs = 6000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Plugin host not connected"));
      return;
    }
    const requestId = nextRequestId();
    pendingRequests.set(requestId, {
      resolve: (m) => resolve(m as T),
      reject,
    });
    const timer = window.setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error("Plugin host request timed out"));
      }
    }, timeoutMs);
    // Clear the timer on resolution by wrapping resolve/reject.
    const original = pendingRequests.get(requestId);
    if (original) {
      pendingRequests.set(requestId, {
        resolve: (m) => {
          window.clearTimeout(timer);
          original.resolve(m);
        },
        reject: (e) => {
          window.clearTimeout(timer);
          original.reject(e);
        },
      });
    }
    sendRaw({ ...message, requestId } as ClientMessage);
  });
}

export async function listPlugins(): Promise<PluginCatalogEntry[]> {
  try {
    const reply = await request<HostMessage>({ type: "listPlugins" });
    if (reply.type === "listPlugins.reply") {
      setState({ catalog: reply.plugins, error: null });
      return reply.plugins;
    }
    return [];
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : "Scan failed" });
    return [];
  }
}

export async function instantiatePlugin(
  pluginId: string,
  trackId: string,
): Promise<PluginInstance | null> {
  try {
    const reply = await request<HostMessage>({
      type: "instantiate",
      pluginId,
      trackId,
    });
    if (reply.type === "instantiate.reply") {
      return reply.instance;
    }
    return null;
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : "Instantiation failed" });
    return null;
  }
}

export function setPluginParameter(
  instanceHandle: string,
  parameterId: string,
  value: number,
): void {
  // Param changes are fire-and-forget — the host echoes via the
  // parameterChanged notification stream so multiple clients (e.g. a
  // remote collaborator) see the same values.
  sendRaw({
    type: "setParameter",
    instanceHandle,
    parameterId,
    value,
  });
}

export function removePluginInstance(instanceHandle: string): void {
  sendRaw({ type: "removeInstance", instanceHandle });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BridgeState {
  return state;
}

/** React hook — re-renders when the bridge state changes. SSR-safe. */
export function usePluginBridge(): BridgeState {
  return useSyncExternalStore(subscribe, getSnapshot, () => initial);
}

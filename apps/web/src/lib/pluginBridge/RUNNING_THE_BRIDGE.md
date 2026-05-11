# EMS Plugin Host bridge

The Studio runs in the browser. Browsers can't load VST3/AU/AAX plugins
directly — there's no Web Audio path to execute the vendor's native code.
To give producers their real Waves / UAD / Antares / iZotope / etc.
plugin chains, we ship a **companion desktop app** (the "EMS Plugin
Host") they install once. It scans their OS, exposes a localhost
WebSocket, and runs the actual DSP. The Studio streams audio in, the
host returns processed audio, and the producer keeps using the
plugins they already paid for.

This file is the wire contract + integration plan. The actual desktop
app lives in `tools/plugin-host` (separate codebase, separate
release cadence).

## What's already shipped in the browser

- `lib/pluginBridge/protocol.ts` — TypeScript types for every message
  the browser ↔ host exchange. Versioned (`BRIDGE_PROTOCOL_VERSION = 1`).
  Both sides parse against these types.
- `lib/pluginBridge/client.ts` — Singleton WebSocket client with auto-
  reconnect, request/response correlation, and a `usePluginBridge()`
  hook the UI subscribes to.
- `components/daw/PluginChain.tsx` — Per-track UI: chain list, reorder
  buttons, bypass toggle, "+ Add plugin" → catalog modal with vendor /
  name / format filter.
- `dawEngine.ts` — `TrackState.pluginSlots` field + 4 setters
  (`addTrackPluginSlot`, `updateTrackPluginSlot`,
  `removeTrackPluginSlot`, `moveTrackPluginSlot`). Slots round-trip
  through project saves so reopening a project on another machine
  rebinds the same plugins if installed.
- A small `PluginHostStatusPill` in the studio header that surfaces
  connect / version / catalog count.

## What the desktop host must do

### Transport

Two WebSockets on localhost:

| Port  | Purpose          | Format         |
|-------|------------------|----------------|
| 5544  | Control channel  | JSON messages  |
| 5545  | Audio channel    | 32-bit float, interleaved stereo, length-prefixed binary frames |

Audio channel keys frames by `instanceHandle`. Each frame:
`[u32 le instanceHandle byteLength][instanceHandle bytes][u32 le numFrames][float32 stereo samples]`.
Sample rate is fixed at 48 kHz to match `AudioContext.sampleRate` in
the browser.

### Plugin scanning

On `hello`, return `pluginSupportAvailable: true` only if the host can
actually load + scan plugins. Then on `listPlugins`:

- macOS: scan `~/Library/Audio/Plug-Ins/VST3`, `~/Library/Audio/Plug-Ins/Components` (AU), system equivalents.
- Windows: scan `%COMMONPROGRAMFILES%\VST3`, `%COMMONPROGRAMFILES(x86)%\VST3`, plus user-configured paths.
- Linux: scan `~/.vst3`, `/usr/lib/vst3`.

For each discovered plugin, attempt a synchronous bundle-load + a
quick license-check call (vendor-specific — Waves uses iLok, UAD uses
their own auth, Antares Auto-Tune uses iLok). If the auth check
fails, return the entry with `authorized: false` so the UI shows
"Authorize in your plugin manager" and disables the Add button.

### Instantiation lifecycle

```
browser → host: instantiate { pluginId, trackId }
host: load bundle, create plugin instance, generate instanceHandle
host: query parameter list (vendor-specific — VST3 uses
      IEditController, AU uses kAudioUnitProperty_ParameterList)
host → browser: instantiate.reply { instance: { handle, params } }
```

The browser stashes the handle + initial params. On every UI param
change, fire-and-forget `setParameter`. The host echoes the change as
a `parameterChanged` notification (so other browser tabs / remote
collaborators stay in sync).

### Audio path

When the browser plays a track:

1. Browser creates an `AudioWorkletNode` that taps the track's post-
   FX bus.
2. The worklet posts 128-sample stereo frames to the main thread.
3. Main thread serializes frame → audio WebSocket → host.
4. Host runs the frame through every plugin in the track's chain.
5. Host returns processed frames over the same audio WebSocket.
6. Browser's worklet replaces the dry signal with the processed
   stream (using a small ring buffer to absorb network jitter).

**Latency budget**: 256-sample ring buffer + worklet quantum + WS
round-trip ≈ 5–10ms on a local loop. Acceptable for monitoring;
unacceptable for live tracking (the browser already has the
recording path for that).

### State save/load

`saveState` returns a base64 blob the host got from the plugin's
own state-saving API (VST3 `IComponent::getState`, AU
`AudioUnitGetProperty(kAudioUnitProperty_ClassInfo)`). Browser
persists the blob alongside the slot's parameter values. `loadState`
hands it back to the plugin on re-instantiation.

## Building the host

Recommended stack:

- **Rust** with [`vst3-rs`](https://github.com/RustAudio/vst3-rs) (or
  [`vst`](https://crates.io/crates/vst) for VST2 fallback) for cross-
  platform VST3 hosting. Audio I/O via [`cpal`](https://crates.io/crates/cpal).
- For Audio Unit support on macOS, link against the system AudioUnit
  framework directly — `coreaudio-rs` crates provide bindings.
- WebSocket server: [`tokio-tungstenite`](https://crates.io/crates/tokio-tungstenite).
- Distribution: code-signed `.dmg` on macOS, signed `.msi` on Windows.
  Auto-update via [`tauri-updater`](https://tauri.app) or similar.

A pure-JS Electron host is possible but Electron can't reliably host
VST3 plugins (V8 sandbox + JS heap allocation patterns clash with the
plugins' real-time audio expectations). Recommend Rust + a thin Tauri
shell for the UI / tray icon.

## Why this design

- **Browser stays canonical**: project format, UI, collab — all live
  in the web app. The host is a stateless audio processor; nothing
  the host owns survives a host crash.
- **Per-license attribution**: producers use their own plugin
  licenses on their own machine. No iLok / UAD authorization issues
  on our side, no DMCA exposure, no SaaS plugin-marketplace mess.
- **Graceful degradation**: when the host is offline, slots persist
  with their parameter values. Reconnect rebinds. Producers can hand
  a project to a teammate who has the same plugins and it just works.

## Open questions for the desktop team

- Sidechain routing: VST3 supports auxiliary inputs. How do we
  surface this in the browser when both signals come from different
  tracks?
- Multi-output plugins (e.g. Kontakt with stems): host gathers all
  outputs and the browser receives them as separate audio streams or
  collapses them?
- MIDI input to plugin synths: separate MIDI channel over the
  control WebSocket? Currently scoped to FX (audio-in/audio-out)
  only.

Tag `@audio-team` in PRs that touch the protocol — the schema bump
must land in both repos together.

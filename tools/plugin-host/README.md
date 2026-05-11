# EMS Plugin Host

Desktop companion for the in-browser Epic Music Space Studio. The
browser cannot load native VST3 / AU / AAX plugins — Web Audio runs in
a sandbox without access to system audio code. This app:

1. Scans the standard plugin install directories on macOS / Windows /
   Linux.
2. Exposes the catalog + parameter graph over a localhost WebSocket
   that the browser-side Studio connects to.
3. Runs the actual plugin DSP in-process and streams audio back to the
   browser over a second WebSocket.

## Status

| Piece | State |
| --- | --- |
| Cross-platform plugin discovery (file walk) | ✅ |
| JSON control protocol on `ws://127.0.0.1:5544` | ✅ |
| Placeholder parameter list per plugin category | ✅ (until SDK linkage) |
| System-tray UI (Tauri 2.x) | ✅ scaffolded |
| Real VST3 hosting via `vst3-rs` | ⏳ gated behind `--features vst3-sdk` |
| Audio channel binary frames + cpal output | ⏳ stub today |
| AU hosting on macOS | ⏳ post-MVP |
| CLAP / AAX | post-MVP |

The browser side renders the plugin chain UI even before the SDK lands;
entries from the placeholder scanner come back marked
`authorized: false` and the UI disables them with a clear hint.

## Layout

```
tools/plugin-host
├── Cargo.toml                     # workspace root
├── crates
│   ├── ems-bridge-protocol        # wire types shared with the browser
│   └── ems-plugin-host            # WS server + scanner + DSP host
└── tauri-shell
    ├── src                        # frontend (none — tray-only)
    └── src-tauri                  # Tauri Rust shell
```

The Rust `ems-bridge-protocol` crate mirrors
`apps/web/src/lib/pluginBridge/protocol.ts`. The `PROTOCOL_VERSION`
constants must stay in lockstep.

## Build

Requires Rust ≥ 1.78 and (for the tauri-shell) Node + the Tauri CLI.

```bash
# Headless daemon (development):
cargo run -p ems-plugin-host

# Tauri tray app:
cd tauri-shell
pnpm install -g @tauri-apps/cli
cargo tauri dev          # local launch
cargo tauri build        # signed installer for the host platform
```

`cargo build --release` from the workspace root builds everything; the
release profile uses LTO + `codegen-units=1` + symbol stripping for a
small ship binary (~12 MB for the daemon, ~22 MB for the tray app).

## Ports

| Port | Channel | Direction |
| ---- | ------- | --------- |
| 5544 | JSON control | bidirectional |
| 5545 | Binary audio (length-prefixed 32-bit float stereo @ 48 kHz) | bidirectional |

Both bind 127.0.0.1 only — the host is never reachable from the
network. The browser surfaces the connection state in the
`PluginHostStatusPill` in the Studio header.

## Adding real plugin hosting

The SDK integration lives behind a `vst3-sdk` cargo feature so the
project builds without proprietary headers. To enable it:

1. Clone Steinberg's VST3 SDK (GPLv3 or commercial license — see
   <https://steinbergmedia.github.io/vst3_dev_portal/>) somewhere on
   disk.
2. Add a build-script env in `crates/ems-plugin-host` pointing at it.
3. Build with `cargo build --features vst3-sdk`.

The placeholder branches in `registry.rs` and `server.rs` are flagged
`cfg(not(feature = "vst3-sdk"))`; the real plugin processor swaps in
when the feature is enabled.

## Verifying end-to-end

1. `cargo run -p ems-plugin-host` (logs `listening on 127.0.0.1:5544`).
2. Open the Studio at `http://localhost:3000/studio` (or
   `https://epicmusicspace.com/studio`).
3. The header `Plugins ·` pill flips from "Bridge offline" to
   "Bridge v0.1.0" once the WS connection settles (1–2 s).
4. Click `+ Add plugin` on any track — the catalog modal lists every
   plugin found on disk, grouped by vendor.

Until the SDK is wired up, every entry shows "Authorize in your
plugin manager" and instantiation returns a placeholder parameter
list. The UX is exercisable but no audio passes through.

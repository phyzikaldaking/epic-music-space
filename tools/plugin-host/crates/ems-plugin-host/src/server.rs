//! WebSocket control server.
//!
//! Listens on [`DEFAULT_CONTROL_PORT`] (default 5544). Each connection
//! is one browser tab. Messages are JSON; the wire format is defined
//! by [`ems_bridge_protocol`]. Audio frames travel on a separate port
//! (5545) so the JSON channel never has to deal with binary data.
//!
//! Connection lifecycle:
//!   1. Browser opens WS, sends `hello`.
//!   2. Host replies `hello.reply` with version + capability flag.
//!   3. Browser issues `listPlugins`/`instantiate`/`setParameter`/etc.
//!   4. Host streams back replies + parameterChanged notifications.
//!
//! The server holds no per-connection state beyond the WS itself —
//! all plugin instances live in the shared [`HostState`] so multiple
//! tabs see the same catalog and (for collab) eventually the same
//! instance set.

use std::sync::Arc;

use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info, warn};

use ems_bridge_protocol::{
    ClientMessage, ErrorCode, HostMessage, PluginCatalogEntry, DEFAULT_CONTROL_PORT,
    PROTOCOL_VERSION,
};

use crate::registry;
use crate::scanner;
use crate::state::HostState;
use crate::HOST_VERSION;

/// Start the control server. Binds 127.0.0.1 only — we never want the
/// host accessible from the network. `port` overrides the default; the
/// Tauri shell uses this to fall back if 5544 is taken.
pub async fn serve_control(state: Arc<HostState>, port: Option<u16>) -> Result<()> {
    let bind_port = port.unwrap_or(DEFAULT_CONTROL_PORT);
    let addr = format!("127.0.0.1:{bind_port}");
    let listener = TcpListener::bind(&addr).await?;
    info!("plugin-host control server listening on ws://{addr}");

    loop {
        let (stream, peer) = listener.accept().await?;
        info!("new control connection from {peer}");
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_connection(state, stream).await {
                warn!("connection error from {peer}: {e:?}");
            }
        });
    }
}

async fn handle_connection(state: Arc<HostState>, stream: TcpStream) -> Result<()> {
    let ws = tokio_tungstenite::accept_async(stream).await?;
    let (mut sink, mut source) = ws.split();

    while let Some(msg) = source.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                warn!("ws read error: {e:?}");
                break;
            }
        };

        let text = match msg {
            Message::Text(t) => t,
            Message::Binary(_) => {
                // Binary frames belong on the audio port. Drop them
                // here rather than failing the connection — the
                // browser may pipeline messages aggressively.
                continue;
            }
            Message::Ping(p) => {
                sink.send(Message::Pong(p)).await.ok();
                continue;
            }
            Message::Close(_) => break,
            _ => continue,
        };

        let parsed: Result<ClientMessage, _> = serde_json::from_str(&text);
        let reply = match parsed {
            Ok(client_msg) => dispatch(&state, client_msg).await,
            Err(e) => HostMessage::Error {
                request_id: None,
                code: ErrorCode::InvalidRequest,
                message: format!("malformed request: {e}"),
            },
        };

        let body = serde_json::to_string(&reply)?;
        if let Err(e) = sink.send(Message::Text(body)).await {
            warn!("ws write failed, closing: {e:?}");
            break;
        }
    }

    info!("control connection closed");
    Ok(())
}

/// Route a single client message to the right registry call and build
/// the reply. Errors get wrapped into `HostMessage::Error` so the
/// browser sees them inline rather than as a torn connection.
async fn dispatch(state: &HostState, msg: ClientMessage) -> HostMessage {
    let request_id = msg.request_id().map(str::to_string);

    match msg {
        ClientMessage::Hello { protocol_version, .. } => {
            if protocol_version != PROTOCOL_VERSION {
                return HostMessage::Error {
                    request_id,
                    code: ErrorCode::ProtocolMismatch,
                    message: format!(
                        "expected protocol v{}, got v{}",
                        PROTOCOL_VERSION, protocol_version
                    ),
                };
            }
            HostMessage::HelloReply {
                request_id,
                protocol_version: PROTOCOL_VERSION,
                host_version: HOST_VERSION.to_string(),
                // Until the SDK feature is enabled we report "false"
                // here. The browser will still render the plugin chain
                // UI but plugins stay disabled with a clear hint.
                plugin_support_available: cfg!(feature = "vst3-sdk"),
            }
        }

        ClientMessage::ListPlugins { .. } => {
            // Re-scan on each call. The disk walk is cheap (~5 ms even
            // with ~100 plugins) and producers install plugins while
            // sessions are open often enough that caching across
            // requests would feel laggy.
            let plugins: Vec<PluginCatalogEntry> = scanner::scan_plugins();
            let plugins = state.set_catalog(plugins);
            HostMessage::ListPluginsReply { request_id, plugins }
        }

        ClientMessage::Instantiate { plugin_id, track_id, .. } => {
            match registry::create_instance(state, &plugin_id, &track_id) {
                Ok(instance) => HostMessage::InstantiateReply { request_id, instance },
                Err(e) => HostMessage::Error {
                    request_id,
                    code: ErrorCode::InstantiationFailed,
                    message: e.to_string(),
                },
            }
        }

        ClientMessage::SetParameter {
            instance_handle,
            parameter_id,
            value,
            ..
        } => match registry::set_parameter(state, &instance_handle, &parameter_id, value) {
            Ok(()) => HostMessage::ParameterChanged {
                instance_handle,
                parameter_id,
                value,
            },
            Err(e) => HostMessage::Error {
                request_id,
                code: ErrorCode::NotFound,
                message: e.to_string(),
            },
        },

        ClientMessage::RemoveInstance { instance_handle, .. } => {
            match registry::remove_instance(state, &instance_handle) {
                Ok(()) => HostMessage::ParameterChanged {
                    // Reuse this notification as an ack — we don't yet
                    // have a dedicated removeInstance.reply variant in
                    // the protocol because the browser doesn't need
                    // one. Echoing back the handle is enough.
                    instance_handle,
                    parameter_id: "__removed__".into(),
                    value: 0.0,
                },
                Err(e) => HostMessage::Error {
                    request_id,
                    code: ErrorCode::NotFound,
                    message: e.to_string(),
                },
            }
        }

        ClientMessage::SaveState { instance_handle, .. } => {
            match registry::save_state(state, &instance_handle) {
                Ok(blob) => HostMessage::SaveStateReply {
                    request_id,
                    instance_handle,
                    state: blob,
                },
                Err(e) => HostMessage::Error {
                    request_id,
                    code: ErrorCode::NotFound,
                    message: e.to_string(),
                },
            }
        }

        ClientMessage::LoadState {
            instance_handle,
            state: blob,
            ..
        } => match registry::load_state(state, &instance_handle, &blob) {
            Ok(()) => HostMessage::ParameterChanged {
                instance_handle,
                parameter_id: "__state_loaded__".into(),
                value: 0.0,
            },
            Err(e) => HostMessage::Error {
                request_id,
                code: ErrorCode::NotFound,
                message: e.to_string(),
            },
        },
    }
}

/// Start the audio server. Stub today — accepts connections, drops the
/// binary frames. Once the SDK feature is enabled and the real plugin
/// processor lands, this is where the cpal output thread + plugin
/// process callback will live.
pub async fn serve_audio(_state: Arc<HostState>, port: Option<u16>) -> Result<()> {
    let bind_port = port.unwrap_or(ems_bridge_protocol::DEFAULT_AUDIO_PORT);
    let addr = format!("127.0.0.1:{bind_port}");
    let listener = TcpListener::bind(&addr).await?;
    info!("plugin-host audio server listening on ws://{addr}");

    loop {
        let (stream, peer) = listener.accept().await?;
        info!("new audio connection from {peer}");
        tokio::spawn(async move {
            if let Err(e) = drain_audio(stream).await {
                error!("audio connection error from {peer}: {e:?}");
            }
        });
    }
}

async fn drain_audio(stream: TcpStream) -> Result<()> {
    let ws = tokio_tungstenite::accept_async(stream).await?;
    let (_sink, mut source) = ws.split();
    while let Some(msg) = source.next().await {
        match msg? {
            Message::Binary(_) => {
                // Drop until the real DSP path is wired up.
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    Ok(())
}

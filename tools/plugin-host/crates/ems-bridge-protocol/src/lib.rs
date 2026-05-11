//! Wire protocol for the EMS Plugin Bridge.
//!
//! This is the Rust mirror of
//! `apps/web/src/lib/pluginBridge/protocol.ts`. The two files MUST
//! stay in lockstep — `PROTOCOL_VERSION` here and `BRIDGE_PROTOCOL_VERSION`
//! there bump together, and the host rejects connections that disagree
//! via the `hello.reply` handshake.
//!
//! Messages flow over a localhost WebSocket on
//! [`DEFAULT_CONTROL_PORT`] as JSON; audio frames stream on
//! [`DEFAULT_AUDIO_PORT`] as length-prefixed 32-bit float stereo.

use serde::{Deserialize, Serialize};

/// Protocol version. Bump in lockstep with the browser side; the host
/// returns this in `hello.reply` and the browser refuses to talk to a
/// host that returns a different number.
pub const PROTOCOL_VERSION: u32 = 1;

/// Default localhost port for the JSON control channel.
pub const DEFAULT_CONTROL_PORT: u16 = 5544;

/// Default localhost port for the binary audio channel.
pub const DEFAULT_AUDIO_PORT: u16 = 5545;

/// Audio sample rate we lock the bridge to. Matches the browser
/// engine's AudioContext sampleRate. Hosts that can't run at 48 kHz
/// return `pluginSupportAvailable: false` in `hello.reply`.
pub const AUDIO_SAMPLE_RATE: u32 = 48_000;

/// Per-frame block size on the audio channel. Smaller = lower latency
/// but more network overhead; 128 samples (~2.7ms at 48k) matches the
/// browser's AudioWorklet quantum.
pub const AUDIO_BLOCK_SIZE: usize = 128;

// ─────────────────────────────────────────────────────────────────────
// Catalog types
// ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "UPPERCASE")]
pub enum PluginFormat {
    Vst3,
    Au,
    Aax,
    Clap,
}

impl PluginFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            PluginFormat::Vst3 => "VST3",
            PluginFormat::Au => "AU",
            PluginFormat::Aax => "AAX",
            PluginFormat::Clap => "CLAP",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCatalogEntry {
    /// Stable identifier: "vendor:name:format" e.g. "Waves:CLA-76:VST3".
    pub id: String,
    pub vendor: String,
    pub name: String,
    pub format: PluginFormat,
    /// Lowercased category for filtering: "eq", "compressor", etc.
    pub category: String,
    /// License authorization status. False entries render disabled.
    pub authorized: bool,
    /// Plugin-reported latency in samples. 0 = zero-latency.
    pub latency_samples: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginParameter {
    pub id: String,
    pub label: String,
    pub min: f64,
    pub max: f64,
    /// 0 = continuous, else granularity step.
    pub step: f64,
    pub value: f64,
    /// Display unit, e.g. "dB". Empty for unitless.
    pub unit: String,
    /// Optional enum choices (overrides min/max/step when present).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub choices: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstance {
    pub instance_handle: String,
    pub plugin_id: String,
    /// Originating track id from the browser engine. Echoed so audio
    /// routing on the host stays correct when multiple tracks share
    /// the same plugin.
    pub track_id: String,
    pub parameters: Vec<PluginParameter>,
}

// ─────────────────────────────────────────────────────────────────────
// Message envelope. Every message carries a `type` discriminator.
// Request messages set `requestId`; replies echo the same value so
// the browser can correlate. Notifications (server → client without
// a matching request) omit it.
// ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    Hello {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(rename = "clientVersion")]
        client_version: String,
    },
    ListPlugins {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
    },
    Instantiate {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        #[serde(rename = "pluginId")]
        plugin_id: String,
        #[serde(rename = "trackId")]
        track_id: String,
    },
    SetParameter {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        #[serde(rename = "instanceHandle")]
        instance_handle: String,
        #[serde(rename = "parameterId")]
        parameter_id: String,
        value: f64,
    },
    RemoveInstance {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        #[serde(rename = "instanceHandle")]
        instance_handle: String,
    },
    SaveState {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        #[serde(rename = "instanceHandle")]
        instance_handle: String,
    },
    LoadState {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        #[serde(rename = "instanceHandle")]
        instance_handle: String,
        /// Base64 plugin state blob.
        state: String,
    },
}

impl ClientMessage {
    /// Return the requestId if this message is a request that expects
    /// a reply. Notifications return None.
    pub fn request_id(&self) -> Option<&str> {
        match self {
            ClientMessage::Hello { request_id, .. }
            | ClientMessage::ListPlugins { request_id }
            | ClientMessage::Instantiate { request_id, .. }
            | ClientMessage::SetParameter { request_id, .. }
            | ClientMessage::RemoveInstance { request_id, .. }
            | ClientMessage::SaveState { request_id, .. }
            | ClientMessage::LoadState { request_id, .. } => request_id.as_deref(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HostMessage {
    #[serde(rename = "hello.reply")]
    HelloReply {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(rename = "hostVersion")]
        host_version: String,
        #[serde(rename = "pluginSupportAvailable")]
        plugin_support_available: bool,
    },
    #[serde(rename = "listPlugins.reply")]
    ListPluginsReply {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        plugins: Vec<PluginCatalogEntry>,
    },
    #[serde(rename = "instantiate.reply")]
    InstantiateReply {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        instance: PluginInstance,
    },
    Error {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        code: ErrorCode,
        message: String,
    },
    ParameterChanged {
        #[serde(rename = "instanceHandle")]
        instance_handle: String,
        #[serde(rename = "parameterId")]
        parameter_id: String,
        value: f64,
    },
    #[serde(rename = "saveState.reply")]
    SaveStateReply {
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        #[serde(rename = "instanceHandle")]
        instance_handle: String,
        state: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    NotFound,
    NotAuthorized,
    InstantiationFailed,
    InvalidRequest,
    ProtocolMismatch,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The browser stringifies messages as JSON with a `type` field
    /// discriminator. This test pins the wire format so a future
    /// rename of a Rust enum variant doesn't silently break the
    /// browser parser.
    #[test]
    fn hello_reply_serializes_as_dotted_string() {
        let msg = HostMessage::HelloReply {
            request_id: Some("req_1".into()),
            protocol_version: 1,
            host_version: "0.1.0".into(),
            plugin_support_available: true,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"hello.reply\""));
        assert!(json.contains("\"protocolVersion\":1"));
        assert!(json.contains("\"hostVersion\":\"0.1.0\""));
    }

    #[test]
    fn instantiate_request_round_trips() {
        let json = r#"{"type":"instantiate","requestId":"r1","pluginId":"Waves:CLA-76:VST3","trackId":"t1"}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        match msg {
            ClientMessage::Instantiate {
                request_id,
                plugin_id,
                track_id,
            } => {
                assert_eq!(request_id.as_deref(), Some("r1"));
                assert_eq!(plugin_id, "Waves:CLA-76:VST3");
                assert_eq!(track_id, "t1");
            }
            _ => panic!("wrong variant"),
        }
    }
}

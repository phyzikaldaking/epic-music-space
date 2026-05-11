//! Plugin instance lifecycle.
//!
//! Sits between the WebSocket server and the (eventually real) VST3/AU
//! plugin host. Until the SDK feature is wired up, this module returns
//! placeholder parameter lists so the browser's plugin chain UI can be
//! exercised end-to-end. The function signatures are stable across the
//! SDK boundary — once the real host lands, only the inner bodies change.

use anyhow::{anyhow, Result};
use uuid::Uuid;

use ems_bridge_protocol::{PluginInstance, PluginParameter};

use crate::state::{HostState, InstanceRecord};

/// Build a new plugin instance for the given catalog id + track id.
///
/// Without the VST3 SDK linked we return a small, sensible parameter
/// list inferred from the plugin's category (e.g. compressors get
/// threshold/ratio/attack/release). The browser UI doesn't care that
/// these aren't the real plugin parameters yet — it just needs
/// *something* to render so the chain UX is testable.
pub fn create_instance(state: &HostState, plugin_id: &str, track_id: &str) -> Result<PluginInstance> {
    let catalog = state
        .lookup_plugin(plugin_id)
        .ok_or_else(|| anyhow!("plugin not in catalog: {plugin_id}"))?;

    let handle = format!("inst_{}", Uuid::new_v4().simple());
    let parameters = placeholder_parameters(&catalog.category);

    let instance = PluginInstance {
        instance_handle: handle.clone(),
        plugin_id: catalog.id.clone(),
        track_id: track_id.to_string(),
        parameters,
    };

    let record = InstanceRecord {
        instance: instance.clone(),
        track_id: track_id.to_string(),
        bypassed: false,
    };

    state
        .instances
        .lock()
        .expect("instances poisoned")
        .insert(handle, record);

    Ok(instance)
}

pub fn remove_instance(state: &HostState, handle: &str) -> Result<()> {
    let removed = state
        .instances
        .lock()
        .expect("instances poisoned")
        .remove(handle);
    if removed.is_none() {
        return Err(anyhow!("no such instance: {handle}"));
    }
    Ok(())
}

/// Update the cached value of a parameter. The real DSP write to the
/// running plugin happens in the SDK-gated branch (not yet present).
pub fn set_parameter(
    state: &HostState,
    handle: &str,
    parameter_id: &str,
    value: f64,
) -> Result<()> {
    let mut guard = state.instances.lock().expect("instances poisoned");
    let record = guard
        .get_mut(handle)
        .ok_or_else(|| anyhow!("no such instance: {handle}"))?;

    let param = record
        .instance
        .parameters
        .iter_mut()
        .find(|p| p.id == parameter_id)
        .ok_or_else(|| anyhow!("no such parameter: {parameter_id}"))?;

    param.value = value.clamp(param.min, param.max);
    Ok(())
}

/// Return the current persisted state for a plugin. Without the SDK we
/// just stringify the parameter snapshot; the real host will serialize
/// the plugin's own state blob via `IComponent::getState`.
pub fn save_state(state: &HostState, handle: &str) -> Result<String> {
    let guard = state.instances.lock().expect("instances poisoned");
    let record = guard
        .get(handle)
        .ok_or_else(|| anyhow!("no such instance: {handle}"))?;
    let json = serde_json::to_string(&record.instance.parameters)?;
    Ok(base64_encode(json.as_bytes()))
}

/// Restore parameters from a previously saved state blob. Real plugin
/// state restore will replace this once the SDK is linked.
pub fn load_state(state: &HostState, handle: &str, blob: &str) -> Result<()> {
    let decoded = base64_decode(blob)?;
    let params: Vec<PluginParameter> = serde_json::from_slice(&decoded)?;
    let mut guard = state.instances.lock().expect("instances poisoned");
    let record = guard
        .get_mut(handle)
        .ok_or_else(|| anyhow!("no such instance: {handle}"))?;
    record.instance.parameters = params;
    Ok(())
}

/// Build a small, category-appropriate parameter list. These are the
/// knobs producers expect to see — replacing them with the real plugin
/// parameters is the SDK integration's job.
fn placeholder_parameters(category: &str) -> Vec<PluginParameter> {
    match category {
        "compressor" => vec![
            param("threshold", "Threshold", -60.0, 0.0, 0.1, -18.0, "dB"),
            param("ratio", "Ratio", 1.0, 20.0, 0.1, 4.0, ":1"),
            param("attack", "Attack", 0.1, 100.0, 0.1, 10.0, "ms"),
            param("release", "Release", 10.0, 1000.0, 1.0, 100.0, "ms"),
            param("makeup", "Makeup", 0.0, 24.0, 0.1, 0.0, "dB"),
        ],
        "eq" => vec![
            param("low_gain", "Low", -18.0, 18.0, 0.1, 0.0, "dB"),
            param("low_freq", "Low Freq", 20.0, 500.0, 1.0, 100.0, "Hz"),
            param("mid_gain", "Mid", -18.0, 18.0, 0.1, 0.0, "dB"),
            param("mid_freq", "Mid Freq", 200.0, 5000.0, 1.0, 1000.0, "Hz"),
            param("high_gain", "High", -18.0, 18.0, 0.1, 0.0, "dB"),
            param("high_freq", "High Freq", 2000.0, 20000.0, 1.0, 8000.0, "Hz"),
        ],
        "reverb" => vec![
            param("size", "Size", 0.0, 1.0, 0.001, 0.5, ""),
            param("decay", "Decay", 0.1, 20.0, 0.01, 2.0, "s"),
            param("damp", "Damping", 0.0, 1.0, 0.001, 0.5, ""),
            param("mix", "Mix", 0.0, 1.0, 0.001, 0.25, ""),
        ],
        "delay" => vec![
            param("time", "Time", 1.0, 2000.0, 1.0, 250.0, "ms"),
            param("feedback", "Feedback", 0.0, 0.95, 0.001, 0.35, ""),
            param("mix", "Mix", 0.0, 1.0, 0.001, 0.25, ""),
        ],
        "vocal" => vec![
            param("retune", "Retune Speed", 0.0, 1.0, 0.001, 0.4, ""),
            param("humanize", "Humanize", 0.0, 1.0, 0.001, 0.3, ""),
            PluginParameter {
                id: "key".to_string(),
                label: "Key".to_string(),
                min: 0.0,
                max: 11.0,
                step: 1.0,
                value: 0.0,
                unit: "".to_string(),
                choices: Some(
                    ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
                        .iter()
                        .map(|s| s.to_string())
                        .collect(),
                ),
            },
        ],
        "saturation" => vec![
            param("drive", "Drive", 0.0, 1.0, 0.001, 0.4, ""),
            param("warmth", "Warmth", 0.0, 1.0, 0.001, 0.5, ""),
            param("mix", "Mix", 0.0, 1.0, 0.001, 1.0, ""),
        ],
        "synth" => vec![
            param("cutoff", "Cutoff", 20.0, 20000.0, 1.0, 4000.0, "Hz"),
            param("resonance", "Resonance", 0.0, 1.0, 0.001, 0.3, ""),
            param("attack", "Attack", 0.001, 5.0, 0.001, 0.01, "s"),
            param("release", "Release", 0.001, 5.0, 0.001, 0.3, "s"),
        ],
        _ => vec![
            param("gain", "Gain", -24.0, 24.0, 0.1, 0.0, "dB"),
            param("mix", "Mix", 0.0, 1.0, 0.001, 1.0, ""),
        ],
    }
}

fn param(id: &str, label: &str, min: f64, max: f64, step: f64, value: f64, unit: &str) -> PluginParameter {
    PluginParameter {
        id: id.to_string(),
        label: label.to_string(),
        min,
        max,
        step,
        value,
        unit: unit.to_string(),
        choices: None,
    }
}

// Tiny base64 codec so we don't add a dep for the placeholder path.
// Replaced by the SDK's real state blob (which is already binary, so
// the wire transport will still use base64 — but via the `base64`
// crate once we're linking other heavy deps anyway).
fn base64_encode(bytes: &[u8]) -> String {
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        out.push(ALPHA[(b0 >> 2) as usize] as char);
        out.push(ALPHA[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(ALPHA[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(ALPHA[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn base64_decode(s: &str) -> Result<Vec<u8>> {
    fn val(b: u8) -> Result<u8> {
        Ok(match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err(anyhow!("invalid base64 byte")),
        })
    }
    let bytes: Vec<u8> = s.bytes().filter(|b| *b != b'=' && !b.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let v0 = val(chunk[0])?;
        let v1 = chunk.get(1).copied().map(val).transpose()?.unwrap_or(0);
        let v2 = chunk.get(2).copied().map(val).transpose()?.unwrap_or(0);
        let v3 = chunk.get(3).copied().map(val).transpose()?.unwrap_or(0);
        out.push((v0 << 2) | (v1 >> 4));
        if chunk.len() > 2 {
            out.push((v1 << 4) | (v2 >> 2));
        }
        if chunk.len() > 3 {
            out.push((v2 << 6) | v3);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ems_bridge_protocol::{PluginCatalogEntry, PluginFormat};

    fn fake_catalog_entry(category: &str) -> PluginCatalogEntry {
        PluginCatalogEntry {
            id: format!("Fake:Plug:{category}"),
            vendor: "Fake".into(),
            name: "Plug".into(),
            format: PluginFormat::Vst3,
            category: category.into(),
            authorized: true,
            latency_samples: 0,
        }
    }

    #[test]
    fn create_then_set_parameter() {
        let state = HostState::new();
        state.set_catalog(vec![fake_catalog_entry("compressor")]);

        let inst = create_instance(&state, "Fake:Plug:compressor", "track-1").unwrap();
        assert!(inst.parameters.iter().any(|p| p.id == "threshold"));

        set_parameter(&state, &inst.instance_handle, "threshold", -12.0).unwrap();
        let guard = state.instances.lock().unwrap();
        let stored = guard.get(&inst.instance_handle).unwrap();
        let t = stored.instance.parameters.iter().find(|p| p.id == "threshold").unwrap();
        assert!((t.value + 12.0).abs() < 1e-9);
    }

    #[test]
    fn save_load_roundtrip() {
        let state = HostState::new();
        state.set_catalog(vec![fake_catalog_entry("reverb")]);

        let inst = create_instance(&state, "Fake:Plug:reverb", "track-1").unwrap();
        set_parameter(&state, &inst.instance_handle, "decay", 5.5).unwrap();

        let blob = save_state(&state, &inst.instance_handle).unwrap();
        set_parameter(&state, &inst.instance_handle, "decay", 0.1).unwrap();
        load_state(&state, &inst.instance_handle, &blob).unwrap();

        let guard = state.instances.lock().unwrap();
        let stored = guard.get(&inst.instance_handle).unwrap();
        let d = stored.instance.parameters.iter().find(|p| p.id == "decay").unwrap();
        assert!((d.value - 5.5).abs() < 1e-9);
    }
}

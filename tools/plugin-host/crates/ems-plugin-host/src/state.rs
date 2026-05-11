//! Shared host state.
//!
//! All connection handlers borrow this through an [`std::sync::Arc`].
//! Lock contention is bounded because the only hot path is parameter
//! changes (one entry per setParameter), and the registry index is
//! a HashMap — O(1) lookup even with hundreds of instances.

use std::collections::HashMap;
use std::sync::Mutex;

use ems_bridge_protocol::{PluginCatalogEntry, PluginInstance};

/// Per-instance state owned by the host. The browser only ever sees
/// the public `PluginInstance` view; everything else (the actual VST3
/// plugin object, the audio processor) stays here.
pub struct InstanceRecord {
    pub instance: PluginInstance,
    /// Track id from the browser engine. Used to route audio frames
    /// arriving on the audio channel.
    pub track_id: String,
    /// Whether the plugin is bypassed. Bypass is stored here rather
    /// than in the public instance because it's a host-side flag, not
    /// a parameter the plugin owns.
    pub bypassed: bool,
}

/// Top-level shared state. One per running daemon process.
pub struct HostState {
    /// Cached scan result. Updated on every `listPlugins` request.
    /// HashMap keyed by `PluginCatalogEntry.id` so instantiation is
    /// an O(1) lookup.
    pub catalog: Mutex<HashMap<String, PluginCatalogEntry>>,
    /// Active plugin instances, keyed by their `instance_handle`.
    pub instances: Mutex<HashMap<String, InstanceRecord>>,
}

impl HostState {
    pub fn new() -> Self {
        Self {
            catalog: Mutex::new(HashMap::new()),
            instances: Mutex::new(HashMap::new()),
        }
    }

    /// Replace the cached catalog with a fresh scan result. Returns
    /// the updated list so the caller can ship it straight back to
    /// the browser.
    pub fn set_catalog(&self, plugins: Vec<PluginCatalogEntry>) -> Vec<PluginCatalogEntry> {
        let mut guard = self.catalog.lock().expect("catalog poisoned");
        guard.clear();
        for entry in &plugins {
            guard.insert(entry.id.clone(), entry.clone());
        }
        plugins
    }

    pub fn lookup_plugin(&self, id: &str) -> Option<PluginCatalogEntry> {
        self.catalog.lock().expect("catalog poisoned").get(id).cloned()
    }
}

impl Default for HostState {
    fn default() -> Self {
        Self::new()
    }
}

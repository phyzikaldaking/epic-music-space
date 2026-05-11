//! Cross-platform plugin scanner.
//!
//! Walks the standard install directories per OS and emits a
//! [`PluginCatalogEntry`] per discovered plugin. Right now we
//! enumerate files only — actual bundle-load + parameter introspection
//! requires linking the Steinberg VST3 SDK (or Apple's AudioUnit
//! framework). That linkage lives behind a `#[cfg(feature = "vst3-sdk")]`
//! gate so the project still builds without the SDK present, returning
//! placeholder entries so the browser UI is reachable end-to-end.

use std::path::PathBuf;

use ems_bridge_protocol::{PluginCatalogEntry, PluginFormat};

/// Best-effort plugin discovery. Returns every plugin bundle we can
/// see on disk, marking each as `authorized: false` until the real
/// VST3 / AU host (gated by the `vst3-sdk` feature) can verify the
/// license. The browser surface treats unauthorized entries as
/// disabled with a "Authorize in your plugin manager" hint, so users
/// see exactly which plugins they have installed even before the SDK
/// integration lands.
pub fn scan_plugins() -> Vec<PluginCatalogEntry> {
    let mut found = Vec::new();
    for dir in plugin_directories() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if let Some(catalog) = entry_to_catalog(&entry.path()) {
                    found.push(catalog);
                }
            }
        }
    }
    found
}

/// Standard plugin install directories per OS. Order roughly mirrors
/// what a DAW would scan first; we don't dedupe by name because the
/// same plugin in different formats (VST3 + AU) is two distinct
/// catalog entries from the browser's perspective.
fn plugin_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let home = dirs::home_dir();

    #[cfg(target_os = "macos")]
    {
        if let Some(h) = &home {
            dirs.push(h.join("Library/Audio/Plug-Ins/VST3"));
            dirs.push(h.join("Library/Audio/Plug-Ins/Components"));
        }
        dirs.push(PathBuf::from("/Library/Audio/Plug-Ins/VST3"));
        dirs.push(PathBuf::from("/Library/Audio/Plug-Ins/Components"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(common) = std::env::var_os("CommonProgramFiles") {
            let common: PathBuf = common.into();
            dirs.push(common.join("VST3"));
        }
        if let Some(common86) = std::env::var_os("CommonProgramFiles(x86)") {
            let common86: PathBuf = common86.into();
            dirs.push(common86.join("VST3"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(h) = &home {
            dirs.push(h.join(".vst3"));
        }
        dirs.push(PathBuf::from("/usr/lib/vst3"));
        dirs.push(PathBuf::from("/usr/local/lib/vst3"));
    }

    let _ = home; // suppress unused-var warnings on platforms that
                  // don't reference it above.
    dirs
}

/// Build a catalog entry from a single filesystem path. Returns None
/// if the path isn't a recognized plugin format.
///
/// Vendor / category are inferred from filename heuristics until the
/// SDK is linked; for example anything matching `(Auto-?Tune|Antares|
/// AT)` lands under vendor "Antares", category "vocal". This is good
/// enough for the marketplace UI to group plugins sensibly; the SDK
/// integration reads the real metadata when it lands.
fn entry_to_catalog(path: &std::path::Path) -> Option<PluginCatalogEntry> {
    let file_name = path.file_name()?.to_string_lossy().to_string();
    let format = match path.extension().and_then(|s| s.to_str()) {
        Some("vst3") => PluginFormat::Vst3,
        Some("component") => PluginFormat::Au,
        // AAX bundles aren't scanned (Avid only) and CLAP support is
        // post-MVP. Both will hook in here when their loader lands.
        _ => return None,
    };

    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.clone());

    let (vendor, category) = guess_vendor_and_category(&stem);
    let id = format!("{vendor}:{stem}:{}", format.as_str());

    Some(PluginCatalogEntry {
        id,
        vendor,
        name: stem,
        format,
        category,
        // Without the SDK we can't actually call the plugin's auth
        // check. Mark every entry as unauthorized so the browser UI
        // disables them; once the SDK integration ships we re-flip
        // this based on the real license result.
        authorized: false,
        // 0 latency until the SDK reports the real value. Browser
        // input-monitoring path tolerates any value.
        latency_samples: 0,
    })
}

/// Heuristic vendor + category from filename. Producers see plugins
/// grouped sensibly even before the SDK reads real metadata. The
/// matchers are intentionally generous — too many false positives is
/// better than the user thinking their UAD plugins didn't install.
fn guess_vendor_and_category(stem: &str) -> (String, String) {
    let lower = stem.to_lowercase();
    let vendor = if lower.contains("uad") || lower.contains("universal audio") {
        "Universal Audio"
    } else if lower.contains("waves") || lower.starts_with("cla-") || lower.starts_with("ssl") {
        "Waves"
    } else if lower.contains("antares") || lower.contains("auto-tune") || lower.contains("autotune") {
        "Antares"
    } else if lower.contains("izotope") || lower.contains("nectar") || lower.contains("ozone") {
        "iZotope"
    } else if lower.contains("fabfilter") {
        "FabFilter"
    } else if lower.contains("soundtoys") {
        "Soundtoys"
    } else if lower.contains("valhalla") {
        "Valhalla"
    } else if lower.contains("kontakt") || lower.contains("native instruments") || lower.contains("massive") {
        "Native Instruments"
    } else if lower.contains("serum") || lower.contains("xfer") {
        "Xfer"
    } else {
        "Unknown"
    };

    let category = if lower.contains("comp") || lower.contains("1176") || lower.contains("ssl") || lower.contains("la-2a") {
        "compressor"
    } else if lower.contains("eq") || lower.contains("pro-q") || lower.contains("ozone eq") {
        "eq"
    } else if lower.contains("reverb") || lower.contains("verb") || lower.contains("hall") || lower.contains("plate") {
        "reverb"
    } else if lower.contains("delay") || lower.contains("echo") {
        "delay"
    } else if lower.contains("auto-tune") || lower.contains("autotune") || lower.contains("melodyne") || lower.contains("nectar") {
        "vocal"
    } else if lower.contains("saturat") || lower.contains("tape") || lower.contains("decapitator") {
        "saturation"
    } else if lower.contains("synth") || lower.contains("massive") || lower.contains("serum") || lower.contains("omnisphere") {
        "synth"
    } else {
        "other"
    };

    (vendor.to_string(), category.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_known_vendors() {
        assert_eq!(guess_vendor_and_category("Waves CLA-76").0, "Waves");
        assert_eq!(guess_vendor_and_category("UAD Pultec EQP-1A").0, "Universal Audio");
        assert_eq!(guess_vendor_and_category("Antares Auto-Tune Pro").0, "Antares");
        assert_eq!(guess_vendor_and_category("iZotope Nectar 4").0, "iZotope");
        assert_eq!(guess_vendor_and_category("FabFilter Pro-Q 3").0, "FabFilter");
    }

    #[test]
    fn classifies_categories() {
        assert_eq!(guess_vendor_and_category("Waves CLA-76").1, "compressor");
        assert_eq!(guess_vendor_and_category("FabFilter Pro-Q 3").1, "eq");
        assert_eq!(guess_vendor_and_category("Valhalla Plate").1, "reverb");
        assert_eq!(guess_vendor_and_category("Soundtoys Decapitator").1, "saturation");
    }
}

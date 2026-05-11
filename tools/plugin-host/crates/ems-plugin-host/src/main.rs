//! Standalone daemon entrypoint.
//!
//! Used for development + the headless install (no Tauri tray). The
//! Tauri shell embeds the library directly via `serve_control` so it
//! shares state with the tray UI process.

use std::sync::Arc;

use anyhow::Result;
use tracing_subscriber::EnvFilter;

use ems_plugin_host::{server, HostState, HOST_VERSION};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tracing::info!("ems-plugin-host v{HOST_VERSION} starting");

    let state = Arc::new(HostState::new());
    let control = tokio::spawn(server::serve_control(state.clone(), None));
    let audio = tokio::spawn(server::serve_audio(state.clone(), None));

    tokio::select! {
        res = control => res??,
        res = audio => res??,
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("ctrl-c received, shutting down");
        }
    }
    Ok(())
}

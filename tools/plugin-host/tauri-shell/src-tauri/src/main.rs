//! Tauri tray-app shell.
//!
//! Wraps the [`ems_plugin_host`] library in a system-tray UI. There's
//! no main window — the app boots, parks a tokio runtime, and runs the
//! control + audio servers in the background. The tray menu surfaces
//! "Open Studio", "Reveal plugin folder", and "Quit".

#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tracing_subscriber::EnvFilter;

use ems_plugin_host::{server, HostState, HOST_VERSION};

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .setup(|app| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()?;
            let state = Arc::new(HostState::new());
            let state_a = state.clone();
            let state_b = state.clone();
            rt.spawn(async move {
                if let Err(e) = server::serve_control(state_a, None).await {
                    tracing::error!("control server died: {e:?}");
                }
            });
            rt.spawn(async move {
                if let Err(e) = server::serve_audio(state_b, None).await {
                    tracing::error!("audio server died: {e:?}");
                }
            });
            // Hand the runtime to Tauri so it isn't dropped at end of
            // setup — otherwise the background tasks abort immediately.
            app.manage(rt);

            // Build the tray menu. Items are static for now; the
            // status text gets updated from a callback once we wire
            // it up.
            let open = MenuItem::with_id(app, "open", "Open Studio", true, None::<&str>)?;
            let reveal = MenuItem::with_id(app, "reveal", "Reveal plugin folder", true, None::<&str>)?;
            let version = MenuItem::with_id(
                app,
                "version",
                format!("Host v{HOST_VERSION}"),
                false,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &reveal, &version, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip(format!("EMS Plugin Host v{HOST_VERSION}"))
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        // Deep-link straight into the in-browser studio.
                        let _ = open::that("https://epicmusicspace.com/studio");
                    }
                    "reveal" => {
                        let _ = open::that(plugin_folder());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, event| {
                    if matches!(event, TrayIconEvent::Click { .. }) {
                        // Left-click is a no-op for now; the menu opens
                        // on right-click. Reserved for "show status"
                        // popover once we have one.
                    }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // Tray-only app — closing the (nonexistent) window
                // should not quit. Producers expect to leave it
                // running in the background for the next session.
                api.prevent_exit();
            }
        });
}

/// Best-effort path to the user's primary plugin folder. Used for the
/// "Reveal plugin folder" menu item.
fn plugin_folder() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Some(h) = dirs::home_dir() {
            return h.join("Library/Audio/Plug-Ins/VST3").display().to_string();
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(c) = std::env::var_os("CommonProgramFiles") {
            let path: std::path::PathBuf = c.into();
            return path.join("VST3").display().to_string();
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(h) = dirs::home_dir() {
            return h.join(".vst3").display().to_string();
        }
    }
    "/".to_string()
}

// Minimal local re-shim for `open::that`. We don't want to pull the
// `open` crate just for one call site; this inline `that` invokes the
// platform's default URL handler. Move to the real crate once we need
// stderr capture.
mod open {
    use std::process::Command;
    pub fn that<S: AsRef<str>>(target: S) -> std::io::Result<()> {
        let t = target.as_ref();
        #[cfg(target_os = "macos")]
        {
            Command::new("open").arg(t).status()?;
        }
        #[cfg(target_os = "windows")]
        {
            Command::new("cmd").args(["/C", "start", "", t]).status()?;
        }
        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open").arg(t).status()?;
        }
        Ok(())
    }
}

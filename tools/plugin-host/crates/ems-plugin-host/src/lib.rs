//! EMS Plugin Host library.
//!
//! Exposes the daemon's public surface so the Tauri shell can embed
//! it in-process (instead of spawning a subprocess) and the smoke
//! test in this crate's bin target can drive it programmatically.

pub mod registry;
pub mod scanner;
pub mod server;
pub mod state;

pub use server::serve_control;
pub use state::HostState;

/// Build version reported in `hello.reply`. Bumped per release; the
/// browser surfaces this in the "Plugins · Host v…" status pill.
pub const HOST_VERSION: &str = env!("CARGO_PKG_VERSION");

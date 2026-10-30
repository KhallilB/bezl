pub mod domain;
pub mod providers;
pub mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(terminal::TerminalPort::default())
        .invoke_handler(tauri::generate_handler![
            providers::preflight::providers_preflight,
            terminal::port::terminal_open,
            terminal::port::terminal_write,
            terminal::port::terminal_drawn,
            terminal::port::terminal_resize,
            terminal::port::terminal_close,
            terminal::port::terminal_snapshot,
            terminal::port::terminal_snapshots,
            terminal::port::terminal_snapshot_open,
            terminal::bench::terminal_bench,
            terminal::bench::terminal_bench_done
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

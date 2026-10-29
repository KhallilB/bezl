pub mod providers;
mod spike_pty;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(spike_pty::Spike::default())
        .invoke_handler(tauri::generate_handler![
            spike_pty::spike_config,
            spike_pty::spike_start,
            spike_pty::spike_write,
            spike_pty::spike_finish,
            spike_pty::spike_log,
            spike_pty::spike_ack
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

//! Spike 1 harness: PTY bytes to the webview over a raw Channel. Delete after the spike.
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Condvar, Mutex};

// Bytes sent to the webview but not yet acked by xterm's write callback.
const HIGH_WATER: usize = 1 << 20;
type Outstanding = Arc<(Mutex<usize>, Condvar)>;
use tauri::State;
use tauri::ipc::{Channel, InvokeResponseBody};

#[derive(Default)]
pub struct Spike {
    writers: Mutex<HashMap<u32, Box<dyn Write + Send>>>,
    outstanding: Mutex<HashMap<u32, Outstanding>>,
}

#[derive(Serialize)]
pub struct Config {
    enabled: bool,
    payload: String,
    expected_bytes: u64,
    result_path: String,
    pid: u32,
}

#[tauri::command]
pub fn spike_config() -> Config {
    let payload = std::env::var("BEZL_SPIKE_PAYLOAD").unwrap_or_default();
    let bytes = std::fs::read(&payload).unwrap_or_default();
    // PTY onlcr turns every \n into \r\n, so expected = size + newline count.
    let newlines = bytes.iter().filter(|b| **b == b'\n').count() as u64;
    let result_path = std::path::Path::new(&payload)
        .with_file_name("result.json")
        .to_string_lossy()
        .into_owned();
    Config {
        enabled: !payload.is_empty(),
        payload,
        expected_bytes: bytes.len() as u64 + newlines,
        result_path,
        pid: std::process::id(),
    }
}

#[tauri::command]
pub fn spike_start(
    id: u32,
    cmd: Vec<String>,
    on_msg: Channel<InvokeResponseBody>,
    state: State<'_, Spike>,
) -> Result<(), String> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let (head, tail) = cmd.split_first().ok_or("empty cmd")?;
    let mut builder = CommandBuilder::new(head);
    builder.args(tail);
    let mut child = pair.slave.spawn_command(builder).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    state.writers.lock().map_err(|e| e.to_string())?.insert(id, writer);
    let pending: Outstanding = Arc::new((Mutex::new(0), Condvar::new()));
    state.outstanding.lock().map_err(|e| e.to_string())?.insert(id, pending.clone());
    std::thread::spawn(move || {
        let master = pair.master;
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if on_msg.send(InvokeResponseBody::Raw(buf[..n].to_vec())).is_err() {
                        break;
                    }
                    // Flow control: block the PTY read until the webview has drained below HIGH_WATER.
                    let (lock, cv) = &*pending;
                    let mut count = lock.lock().unwrap();
                    *count += n;
                    while *count > HIGH_WATER {
                        count = cv.wait(count).unwrap();
                    }
                }
            }
        }
        let code = child.wait().map(|s| s.exit_code() as i32).unwrap_or(-1);
        let _ = on_msg.send(InvokeResponseBody::Json(format!("{{\"exit\":{code}}}")));
        drop(master);
    });
    Ok(())
}

#[tauri::command]
pub fn spike_write(id: u32, data: String, state: State<'_, Spike>) -> Result<(), String> {
    let mut writers = state.writers.lock().map_err(|e| e.to_string())?;
    let w = writers.get_mut(&id).ok_or("no pty")?;
    w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn spike_ack(id: u32, n: usize, state: State<'_, Spike>) -> Result<(), String> {
    let map = state.outstanding.lock().map_err(|e| e.to_string())?;
    let (lock, cv) = &**map.get(&id).ok_or("no pty")?;
    let mut count = lock.lock().map_err(|e| e.to_string())?;
    *count = count.saturating_sub(n);
    cv.notify_all();
    Ok(())
}

#[tauri::command]
pub fn spike_finish(path: String, report: String) -> Result<(), String> {
    std::fs::write(&path, report).map_err(|e| e.to_string())?;
    std::process::exit(0);
}

#[tauri::command]
pub fn spike_log(msg: String) {
    println!("[spike] {msg}");
}

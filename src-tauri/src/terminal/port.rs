//! The terminal port: every open pane by id, and the commands the screen drives them with.
use super::pane::{Output, Pane, Spawn};
use std::collections::HashMap;
use std::io;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::{Channel, InvokeResponseBody};

/// Undrawn bytes per pane before its agent is held. M4 allows 1 MiB; all panes share one
/// webview queue, so echo waits behind every pane's backlog: 1 MiB measured 578 ms, 128 KiB 31 ms.
pub const PANE_LIMIT: usize = 128 * 1024;

pub type PaneId = u32;

#[derive(Default)]
pub struct TerminalPort {
    next: AtomicU32,
    panes: Mutex<HashMap<PaneId, Arc<Pane>>>,
}

impl TerminalPort {
    pub fn open(&self, spec: Spawn, out: impl Output) -> io::Result<PaneId> {
        let pane = Pane::spawn(spec, out, PANE_LIMIT)?;
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.panes.lock().unwrap().insert(id, Arc::new(pane));
        Ok(id)
    }

    pub fn write(&self, id: PaneId, input: &[u8]) -> io::Result<()> {
        self.with(id, |p| p.write(input))
    }

    pub fn drawn(&self, id: PaneId, n: usize) -> io::Result<()> {
        self.with(id, |p| {
            p.drawn(n);
            Ok(())
        })
    }

    pub fn resize(&self, id: PaneId, cols: u16, rows: u16) -> io::Result<()> {
        self.with(id, |p| p.resize(cols, rows))
    }

    /// Kills the pane's agent and forgets the pane. Closing an unknown pane is a no-op.
    pub fn close(&self, id: PaneId) {
        let pane = self.panes.lock().unwrap().remove(&id);
        if let Some(pane) = pane {
            pane.close();
        }
    }

    fn with<T>(&self, id: PaneId, f: impl FnOnce(&Pane) -> io::Result<T>) -> io::Result<T> {
        // A clone, so a write held by a full PTY never holds the map.
        let pane = self.panes.lock().unwrap().get(&id).cloned();
        let pane =
            pane.ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("no pane {id}")))?;
        f(&pane)
    }
}

/// Bytes go to the webview raw; the exit as `{"exit": code}`.
struct ChannelOutput(Channel<InvokeResponseBody>);

impl Output for ChannelOutput {
    fn bytes(&self, chunk: Vec<u8>) -> bool {
        self.0.send(InvokeResponseBody::Raw(chunk)).is_ok()
    }
    fn exit(&self, code: Option<u32>) {
        let body = serde_json::json!({ "exit": code }).to_string();
        let _ = self.0.send(InvokeResponseBody::Json(body));
    }
}

/// `argv` defaults to the login shell, `cwd` to the app's working directory.
#[tauri::command]
pub fn terminal_open(
    argv: Option<Vec<String>>,
    cwd: Option<std::path::PathBuf>,
    cols: u16,
    rows: u16,
    on_output: Channel<InvokeResponseBody>,
    port: tauri::State<'_, TerminalPort>,
) -> Result<PaneId, String> {
    let argv = argv.unwrap_or_else(|| {
        vec![
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()),
            "-l".into(),
        ]
    });
    let cwd = cwd.or_else(|| std::env::current_dir().ok());
    let spec = Spawn {
        argv,
        cwd,
        cols,
        rows,
    };
    port.open(spec, ChannelOutput(on_output))
        .map_err(|e| e.to_string())
}

/// Async so a write held by a full PTY never blocks the main thread.
#[tauri::command]
pub async fn terminal_write(
    id: PaneId,
    data: String,
    port: tauri::State<'_, TerminalPort>,
) -> Result<(), String> {
    port.write(id, data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_drawn(
    id: PaneId,
    n: usize,
    port: tauri::State<'_, TerminalPort>,
) -> Result<(), String> {
    port.drawn(id, n).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(
    id: PaneId,
    cols: u16,
    rows: u16,
    port: tauri::State<'_, TerminalPort>,
) -> Result<(), String> {
    port.resize(id, cols, rows).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_close(id: PaneId, port: tauri::State<'_, TerminalPort>) {
    port.close(id);
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::mpsc::{self, Sender};
    use std::time::Duration;

    struct Exits(Mutex<Sender<Option<u32>>>);

    impl Output for Exits {
        fn bytes(&self, _: Vec<u8>) -> bool {
            true
        }
        fn exit(&self, code: Option<u32>) {
            let _ = self.0.lock().unwrap().send(code);
        }
    }

    fn spec(argv: &[&str]) -> Spawn {
        Spawn {
            argv: argv.iter().map(|s| s.to_string()).collect(),
            cwd: None,
            cols: 80,
            rows: 24,
        }
    }

    #[test]
    fn gives_each_pane_its_own_id() {
        let port = TerminalPort::default();
        let (tx, _rx) = mpsc::channel();
        let a = port
            .open(spec(&["cat"]), Exits(Mutex::new(tx.clone())))
            .unwrap();
        let b = port.open(spec(&["cat"]), Exits(Mutex::new(tx))).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn unknown_panes_are_not_found() {
        let port = TerminalPort::default();
        assert_eq!(
            port.write(7, b"x").unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        assert_eq!(
            port.drawn(7, 1).unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        assert_eq!(
            port.resize(7, 80, 24).unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        port.close(7);
    }

    #[test]
    fn close_kills_the_agent_and_forgets_the_pane() {
        let port = TerminalPort::default();
        let (tx, rx) = mpsc::channel();
        let id = port.open(spec(&["cat"]), Exits(Mutex::new(tx))).unwrap();
        port.close(id);
        assert!(
            rx.recv_timeout(Duration::from_secs(5)).is_ok(),
            "agent never exited"
        );
        assert_eq!(
            port.write(id, b"x").unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
    }

    #[test]
    fn a_failed_spawn_opens_nothing() {
        let port = TerminalPort::default();
        let (tx, _rx) = mpsc::channel();
        assert!(port.open(spec(&[]), Exits(Mutex::new(tx))).is_err());
        assert!(port.panes.lock().unwrap().is_empty());
    }
}

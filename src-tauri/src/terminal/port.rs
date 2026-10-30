//! The terminal port: every open pane by id, and the commands the screen drives them with.
use super::pane::{Output, Pane, Spawn};
use super::record::{Record, Saved, SavedRef};
use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::{Channel, InvokeResponseBody};

/// Undrawn bytes per pane before its agent is held; M4 allows 1 MiB. All panes share one webview
/// queue, so echo waits behind every backlog: 512 KiB in 256 KiB messages measured 30 ms at most.
pub const PANE_LIMIT: usize = 512 * 1024;

pub type PaneId = u32;

#[derive(Default)]
pub struct TerminalPort {
    next: AtomicU32,
    panes: Mutex<HashMap<PaneId, Arc<Entry>>>,
}

struct Entry {
    pane: Pane,
    name: String,
    /// Where the agent runs; its clone holds the pane's snapshots.
    cwd: PathBuf,
}

impl TerminalPort {
    /// `name` keys the pane's folder in the record.
    pub fn open(&self, name: &str, spec: Spawn, out: impl Output) -> io::Result<PaneId> {
        let cwd = match &spec.cwd {
            Some(cwd) => cwd.clone(),
            None => std::env::current_dir()?,
        };
        let pane = Pane::spawn(
            Spawn {
                cwd: Some(cwd.clone()),
                ..spec
            },
            out,
            PANE_LIMIT,
        )?;
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let entry = Entry {
            pane,
            name: name.into(),
            cwd,
        };
        self.panes.lock().unwrap().insert(id, Arc::new(entry));
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

    /// Saves what the pane's screen shows into the record of the checkout it runs in.
    pub fn snapshot(&self, id: PaneId) -> io::Result<SavedRef> {
        let entry = self.entry(id)?;
        let snapshot = entry.pane.snapshot()?;
        let taken_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(io::Error::other)?
            .as_millis() as u64;
        Record::for_checkout(&entry.cwd)?.save(&entry.name, taken_at, &snapshot)
    }

    /// Kills the pane's agent and forgets the pane. Closing an unknown pane is a no-op.
    pub fn close(&self, id: PaneId) {
        let entry = self.panes.lock().unwrap().remove(&id);
        if let Some(entry) = entry {
            entry.pane.close();
        }
    }

    fn with<T>(&self, id: PaneId, f: impl FnOnce(&Pane) -> io::Result<T>) -> io::Result<T> {
        f(&self.entry(id)?.pane)
    }

    /// A clone, so a write held by a full PTY never holds the map.
    fn entry(&self, id: PaneId) -> io::Result<Arc<Entry>> {
        let entry = self.panes.lock().unwrap().get(&id).cloned();
        entry.ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("no pane {id}")))
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

/// `argv` defaults to the login shell, `cwd` to the app's working directory, `name` to "pane".
#[tauri::command]
pub fn terminal_open(
    argv: Option<Vec<String>>,
    cwd: Option<PathBuf>,
    name: Option<String>,
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
    let spec = Spawn {
        argv,
        cwd,
        cols,
        rows,
    };
    let name = name.as_deref().unwrap_or("pane");
    port.open(name, spec, ChannelOutput(on_output))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_snapshot(
    id: PaneId,
    port: tauri::State<'_, TerminalPort>,
) -> Result<SavedRef, String> {
    port.snapshot(id).map_err(|e| e.to_string())
}

/// Snapshots in the record of the app's own checkout, newest first.
#[tauri::command]
pub fn terminal_snapshots() -> Result<Vec<SavedRef>, String> {
    app_record()
        .and_then(|r| r.list())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_snapshot_open(pane: String, taken_at: u64) -> Result<Saved, String> {
    app_record()
        .and_then(|r| r.open(&pane, taken_at))
        .map_err(|e| e.to_string())
}

// Panes default to the app's working directory, so their snapshots land in its record.
fn app_record() -> io::Result<Record> {
    Record::for_checkout(&std::env::current_dir()?)
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
            .open("pane", spec(&["cat"]), Exits(Mutex::new(tx.clone())))
            .unwrap();
        let b = port
            .open("pane", spec(&["cat"]), Exits(Mutex::new(tx)))
            .unwrap();
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
        let id = port
            .open("pane", spec(&["cat"]), Exits(Mutex::new(tx)))
            .unwrap();
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
    fn snapshots_a_pane_into_its_checkouts_record() {
        let repo = std::env::temp_dir().join(format!("bezl-port-snap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&repo);
        std::fs::create_dir_all(&repo).unwrap();
        assert!(
            std::process::Command::new("git")
                .args(["init", "-q"])
                .current_dir(&repo)
                .status()
                .unwrap()
                .success()
        );
        let port = TerminalPort::default();
        let (tx, rx) = mpsc::channel();
        let mut s = spec(&["printf", "snapshot me"]);
        s.cwd = Some(repo.clone());
        let id = port.open("Writer", s, Exits(Mutex::new(tx))).unwrap();
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let saved = port.snapshot(id).unwrap();
        assert_eq!(saved.pane, "writer");
        let back = Record::for_checkout(&repo)
            .unwrap()
            .open(&saved.pane, saved.taken_at)
            .unwrap();
        assert_eq!(back.snapshot.plain.trim_end(), "snapshot me");
        assert_eq!(
            port.snapshot(99).unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        let _ = std::fs::remove_dir_all(&repo);
    }

    #[test]
    fn a_pane_outside_a_checkout_has_no_record_to_save_to() {
        let dir = std::env::temp_dir().join(format!("bezl-port-nogit-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let port = TerminalPort::default();
        let (tx, _rx) = mpsc::channel();
        let mut s = spec(&["cat"]);
        s.cwd = Some(dir.clone());
        let id = port.open("pane", s, Exits(Mutex::new(tx))).unwrap();
        assert_eq!(
            port.snapshot(id).unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_failed_spawn_opens_nothing() {
        let port = TerminalPort::default();
        let (tx, _rx) = mpsc::channel();
        assert!(port.open("pane", spec(&[]), Exits(Mutex::new(tx))).is_err());
        assert!(port.panes.lock().unwrap().is_empty());
    }
}

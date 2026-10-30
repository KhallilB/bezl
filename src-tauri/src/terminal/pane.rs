//! One agent session in a PTY. Its reader holds back once the screen falls `limit` bytes behind.
use super::credit::Credit;
use super::screen::{Screen, Snapshot};
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Largest single read. `Credit::reserve` waits until it all fits, so it stays well under the limit.
const READ: usize = 64 * 1024;
/// Largest screen message.
const CHUNK: usize = 256 * 1024;
/// macOS PTY reads are ~1 KiB. Sent one per message, echo lagged 134 ms behind three floods.
const GATHER: Duration = Duration::from_millis(4);

/// Where a pane's output goes. `bytes` returns false once nobody is drawing it.
pub trait Output: Send + 'static {
    fn bytes(&self, chunk: Vec<u8>) -> bool;
    /// `None` when the exit status could not be read.
    fn exit(&self, code: Option<u32>);
}

#[derive(Clone, Debug)]
pub struct Spawn {
    pub argv: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub cols: u16,
    pub rows: u16,
}

pub struct Pane {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    credit: Arc<Credit>,
    screen: Arc<Screen>,
}

impl Pane {
    pub fn spawn(spec: Spawn, out: impl Output, limit: usize) -> io::Result<Pane> {
        let (program, args) = spec
            .argv
            .split_first()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "empty command"))?;
        let pair = native_pty_system()
            .openpty(size(spec.cols, spec.rows))
            .map_err(io::Error::other)?;
        let mut cmd = CommandBuilder::new(program);
        cmd.args(args);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if let Some(cwd) = &spec.cwd {
            cmd.cwd(cwd);
        }
        let screen = Arc::new(Screen::new(spec.cols, spec.rows)?);
        let mut child = pair.slave.spawn_command(cmd).map_err(io::Error::other)?;
        // Our copy of the slave would keep the master from ever reading EOF.
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(io::Error::other)?;
        let writer = pair.master.take_writer().map_err(io::Error::other)?;
        let killer = child.clone_killer();
        let credit = Arc::new(Credit::new(limit));
        let held = credit.clone();
        let (reads, gathered) = mpsc::channel();
        std::thread::spawn(move || {
            let mut buf = vec![0u8; READ];
            while let Some(n) = held.reserve(READ) {
                let got = match reader.read(&mut buf[..n]) {
                    Ok(0) | Err(_) => 0,
                    Ok(got) => got,
                };
                held.release(n - got);
                if got == 0 || reads.send(buf[..got].to_vec()).is_err() {
                    break;
                }
            }
        });
        let mirror = screen.clone();
        let unheld = credit.clone();
        std::thread::spawn(move || {
            while let Some(chunk) = gather(&gathered, CHUNK, GATHER) {
                mirror.feed(chunk.clone());
                if !out.bytes(chunk) {
                    break;
                }
            }
            // Nobody draws: the agent must not block forever on a full PTY, nor the reader on credit.
            let _ = child.kill();
            unheld.close();
            out.exit(child.wait().ok().map(|s| s.exit_code()));
        });
        Ok(Pane {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            killer: Mutex::new(killer),
            credit,
            screen,
        })
    }

    /// Typed input, as the agent would read it from its terminal.
    pub fn write(&self, input: &[u8]) -> io::Result<()> {
        let mut w = self.writer.lock().unwrap();
        w.write_all(input)?;
        w.flush()
    }

    /// The screen has drawn `n` more bytes.
    pub fn drawn(&self, n: usize) {
        self.credit.release(n);
    }

    pub fn resize(&self, cols: u16, rows: u16) -> io::Result<()> {
        self.master
            .lock()
            .unwrap()
            .resize(size(cols, rows))
            .map_err(io::Error::other)?;
        self.screen.resize(cols, rows);
        Ok(())
    }

    /// The screen as Ghostty parsed it, possibly ahead of the drawn screen by undrawn bytes.
    pub fn snapshot(&self) -> io::Result<Snapshot> {
        self.screen.snapshot()
    }

    /// Kills the agent and frees a reader held at the limit. Its exit still reaches `Output`.
    pub fn close(&self) {
        let _ = self.killer.lock().unwrap().kill();
        self.credit.close();
    }
}

/// Waits for one read, then joins what follows within `window` until it holds `max` bytes.
/// `None` once the reader is gone and nothing is left.
fn gather(reads: &Receiver<Vec<u8>>, max: usize, window: Duration) -> Option<Vec<u8>> {
    let mut chunk = reads.recv().ok()?;
    let until = Instant::now() + window;
    while chunk.len() < max {
        match reads.recv_timeout(until.saturating_duration_since(Instant::now())) {
            Ok(more) => chunk.extend(more),
            Err(_) => break,
        }
    }
    Some(chunk)
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

impl Drop for Pane {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::mpsc::{self, Receiver, Sender};
    use std::time::{Duration, Instant};

    enum Event {
        Bytes(Vec<u8>),
        Exit(Option<u32>),
    }

    struct Collect(Mutex<Sender<Event>>);

    impl Output for Collect {
        fn bytes(&self, chunk: Vec<u8>) -> bool {
            self.0.lock().unwrap().send(Event::Bytes(chunk)).is_ok()
        }
        fn exit(&self, code: Option<u32>) {
            let _ = self.0.lock().unwrap().send(Event::Exit(code));
        }
    }

    fn open(argv: &[&str], limit: usize) -> (Pane, Receiver<Event>) {
        let (tx, rx) = mpsc::channel();
        let spec = Spawn {
            argv: argv.iter().map(|s| s.to_string()).collect(),
            cwd: None,
            cols: 80,
            rows: 24,
        };
        (
            Pane::spawn(spec, Collect(Mutex::new(tx)), limit).unwrap(),
            rx,
        )
    }

    /// Draws everything until exit, acking each chunk as a screen would.
    fn drain(pane: &Pane, rx: &Receiver<Event>) -> (Vec<u8>, Option<u32>) {
        let mut got = Vec::new();
        loop {
            match rx
                .recv_timeout(Duration::from_secs(20))
                .expect("pane stalled")
            {
                Event::Bytes(b) => {
                    pane.drawn(b.len());
                    got.extend(b);
                }
                Event::Exit(code) => return (got, code),
            }
        }
    }

    /// macOS's tty re-sends the CR of an onlcr CRLF when its queue fills mid-pair. Extra, never lost.
    fn without_retried_cr(got: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(got.len());
        for (i, &b) in got.iter().enumerate() {
            if !(b == b'\r' && got.get(i + 1) == Some(&b'\r') && got.get(i + 2) == Some(&b'\n')) {
                out.push(b);
            }
        }
        out
    }

    /// Base64-like lines; a PTY's onlcr turns each `\n` into `\r\n`.
    fn payload(lines: usize) -> (Temp, Vec<u8>) {
        let mut body = Vec::new();
        for i in 0..lines {
            body.extend(
                format!(
                    "{i:08} {}\n",
                    "abcdefghijklmnopqrstuvwxyz0123456789".repeat(2)
                )
                .bytes(),
            );
        }
        let expected = body
            .iter()
            .flat_map(|&b| {
                if b == b'\n' {
                    vec![b'\r', b'\n']
                } else {
                    vec![b]
                }
            })
            .collect();
        (Temp::with(&body), expected)
    }

    struct Temp(std::path::PathBuf);

    impl Temp {
        fn with(body: &[u8]) -> Temp {
            static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
            let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let p = std::env::temp_dir().join(format!("bezl-pane-{}-{n}", std::process::id()));
            std::fs::write(&p, body).unwrap();
            Temp(p)
        }
        fn arg(&self) -> &str {
            self.0.to_str().unwrap()
        }
    }

    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    #[test]
    fn streams_every_byte_in_order() {
        let (file, expected) = payload(60_000);
        let (pane, rx) = open(&["cat", file.arg()], 1 << 20);
        let (got, code) = drain(&pane, &rx);
        assert_eq!(code, Some(0));
        assert!(
            without_retried_cr(&got) == expected,
            "bytes lost or changed"
        );
    }

    #[test]
    fn gathers_small_pty_reads_into_few_messages() {
        let (file, _) = payload(60_000);
        let (pane, rx) = open(&["cat", file.arg()], 1 << 20);
        let mut messages = 0;
        let mut bytes = 0;
        while let Event::Bytes(b) = rx
            .recv_timeout(Duration::from_secs(20))
            .expect("pane stalled")
        {
            messages += 1;
            bytes += b.len();
            pane.drawn(b.len());
        }
        let mean = bytes / messages;
        assert!(mean >= 8 * 1024, "{messages} messages of {mean} bytes");
    }

    #[test]
    fn gather_joins_reads_that_arrive_within_the_window() {
        let (tx, rx) = mpsc::channel();
        for read in [b"ab".to_vec(), b"cd".to_vec(), b"ef".to_vec()] {
            tx.send(read).unwrap();
        }
        assert_eq!(
            gather(&rx, 64, Duration::from_millis(50)).unwrap(),
            b"abcdef"
        );
    }

    #[test]
    fn gather_stops_once_it_holds_max_bytes() {
        let (tx, rx) = mpsc::channel();
        for read in [b"abcd".to_vec(), b"efgh".to_vec(), b"ijkl".to_vec()] {
            tx.send(read).unwrap();
        }
        let window = Duration::from_millis(50);
        assert_eq!(gather(&rx, 6, window).unwrap(), b"abcdefgh");
        assert_eq!(gather(&rx, 6, window).unwrap(), b"ijkl");
    }

    #[test]
    fn gather_sends_what_it_has_once_the_window_passes() {
        let (tx, rx) = mpsc::channel();
        tx.send(b"echo".to_vec()).unwrap();
        let start = Instant::now();
        assert_eq!(gather(&rx, 64, Duration::from_millis(20)).unwrap(), b"echo");
        assert!(start.elapsed() < Duration::from_millis(500));
        drop(tx);
    }

    #[test]
    fn gather_ends_once_the_reader_is_gone_and_drained() {
        let (tx, rx) = mpsc::channel();
        tx.send(b"last".to_vec()).unwrap();
        drop(tx);
        let window = Duration::from_millis(50);
        assert_eq!(gather(&rx, 64, window).unwrap(), b"last");
        assert_eq!(gather(&rx, 64, window), None);
    }

    #[test]
    fn holds_the_agent_once_the_screen_is_limit_bytes_behind() {
        let (file, expected) = payload(60_000);
        let limit = 256 * 1024;
        let (pane, rx) = open(&["cat", file.arg()], limit);
        let mut held = Vec::new();
        while let Ok(Event::Bytes(b)) = rx.recv_timeout(Duration::from_millis(500)) {
            held.extend(b);
        }
        let n = held.len();
        assert!(n <= limit, "{n} bytes undrawn, limit {limit}");
        assert!(n > limit / 2, "reader stopped early at {n}");
        assert!(n < expected.len());
        pane.drawn(n);
        let (rest, code) = drain(&pane, &rx);
        assert_eq!(code, Some(0));
        held.extend(rest);
        assert!(
            without_retried_cr(&held) == expected,
            "bytes lost or changed"
        );
    }

    #[test]
    fn typed_input_reaches_the_agent_and_echoes() {
        let (pane, rx) = open(&["cat"], 1 << 20);
        let start = Instant::now();
        pane.write(b"bezl-echo\r").unwrap();
        let mut seen = Vec::new();
        while !String::from_utf8_lossy(&seen).contains("bezl-echo") {
            match rx.recv_timeout(Duration::from_secs(2)).expect("no echo") {
                Event::Bytes(b) => {
                    pane.drawn(b.len());
                    seen.extend(b);
                }
                Event::Exit(_) => panic!("cat exited"),
            }
        }
        assert!(
            start.elapsed() < Duration::from_millis(100),
            "{:?}",
            start.elapsed()
        );
        pane.write(b"\x04").unwrap();
        let (_, code) = drain(&pane, &rx);
        assert_eq!(code, Some(0));
    }

    #[test]
    fn reports_the_agent_exit_code() {
        let (pane, rx) = open(&["sh", "-c", "exit 3"], 1 << 20);
        assert_eq!(drain(&pane, &rx).1, Some(3));
    }

    #[test]
    fn close_ends_an_agent_held_at_the_limit() {
        let (file, _) = payload(60_000);
        let (pane, rx) = open(&["cat", file.arg()], 64 * 1024);
        while let Ok(Event::Bytes(_)) = rx.recv_timeout(Duration::from_millis(300)) {}
        pane.close();
        let exit = loop {
            match rx
                .recv_timeout(Duration::from_secs(5))
                .expect("no exit after close")
            {
                Event::Exit(code) => break code,
                Event::Bytes(_) => {}
            }
        };
        assert_ne!(exit, Some(0));
    }

    #[test]
    fn resize_reaches_the_agent() {
        let (pane, rx) = open(&["sh", "-c", "sleep 0.3; stty size"], 1 << 20);
        pane.resize(100, 30).unwrap();
        let (got, _) = drain(&pane, &rx);
        assert!(String::from_utf8_lossy(&got).contains("30 100"));
    }

    #[test]
    fn snapshots_what_the_agent_printed() {
        let (pane, rx) = open(&["printf", "\\033[32mready\\033[0m\\nsecond line"], 1 << 20);
        drain(&pane, &rx);
        let snap = pane.snapshot().unwrap();
        assert_eq!((snap.cols, snap.rows), (80, 24));
        assert_eq!(
            snap.plain.lines().collect::<Vec<_>>(),
            ["ready", "second line"]
        );
        assert!(snap.vt.contains("ready"));
    }

    #[test]
    fn the_snapshot_follows_a_resize() {
        let (pane, rx) = open(&["cat"], 1 << 20);
        pane.resize(100, 30).unwrap();
        let snap = pane.snapshot().unwrap();
        assert_eq!((snap.cols, snap.rows), (100, 30));
        pane.close();
        drain(&pane, &rx);
    }

    #[test]
    fn refuses_an_empty_command() {
        let (tx, _rx) = mpsc::channel();
        let spec = Spawn {
            argv: vec![],
            cwd: None,
            cols: 80,
            rows: 24,
        };
        assert!(Pane::spawn(spec, Collect(Mutex::new(tx)), 1 << 20).is_err());
    }
}

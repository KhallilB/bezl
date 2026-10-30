//! A pane's screen as Ghostty's engine parses it, for snapshots. One thread owns the engine,
//! since libghostty-vt's `Terminal` is not `Send`.
use libghostty_vt::fmt::{Format, Formatter, FormatterOptions};
use libghostty_vt::{Terminal, TerminalOptions};
use serde::{Deserialize, Serialize};
use std::io;
use std::sync::mpsc::{self, SyncSender};

/// Chunks queued for the engine; a full queue holds the pane's reader.
const QUEUE: usize = 16;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Snapshot {
    pub cols: u16,
    pub rows: u16,
    /// The screen as text, trailing blanks trimmed.
    pub plain: String,
    /// The screen as VT sequences with colours and styles; replays into a terminal this size.
    pub vt: String,
}

enum Msg {
    Bytes(Vec<u8>),
    Resize(u16, u16),
    Snapshot(mpsc::Sender<io::Result<Snapshot>>),
}

pub struct Screen {
    tx: SyncSender<Msg>,
}

impl Screen {
    pub fn new(cols: u16, rows: u16) -> io::Result<Screen> {
        let (tx, rx) = mpsc::sync_channel::<Msg>(QUEUE);
        let (ready, started) = mpsc::channel();
        std::thread::spawn(move || {
            // No scrollback: a snapshot is the screen, as the pane shows it.
            let opts = TerminalOptions {
                cols,
                rows,
                max_scrollback: 0,
            };
            let mut term = match Terminal::new(opts) {
                Ok(term) => term,
                Err(e) => return drop(ready.send(Err(io::Error::other(e)))),
            };
            let _ = ready.send(Ok(()));
            for msg in rx {
                match msg {
                    Msg::Bytes(b) => term.vt_write(&b),
                    Msg::Resize(cols, rows) => drop(term.resize(cols, rows, 0, 0)),
                    Msg::Snapshot(reply) => drop(reply.send(snapshot(&term))),
                }
            }
        });
        started
            .recv()
            .map_err(|_| io::Error::other("screen thread died"))??;
        Ok(Screen { tx })
    }

    pub fn feed(&self, bytes: Vec<u8>) {
        let _ = self.tx.send(Msg::Bytes(bytes));
    }

    pub fn resize(&self, cols: u16, rows: u16) {
        let _ = self.tx.send(Msg::Resize(cols, rows));
    }

    /// The screen once every byte fed so far is parsed.
    pub fn snapshot(&self) -> io::Result<Snapshot> {
        let (reply, answer) = mpsc::channel();
        self.tx
            .send(Msg::Snapshot(reply))
            .map_err(|_| io::Error::other("screen thread died"))?;
        answer
            .recv()
            .map_err(|_| io::Error::other("screen thread died"))?
    }
}

fn snapshot(term: &Terminal) -> io::Result<Snapshot> {
    let text = |format| -> io::Result<String> {
        let opts = FormatterOptions::new().with_format(format).with_trim(true);
        let bytes = Formatter::new(term, opts)
            .and_then(|mut f| f.format_alloc(None).map(|b| b.to_vec()))
            .map_err(io::Error::other)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    };
    Ok(Snapshot {
        cols: term.cols().map_err(io::Error::other)?,
        rows: term.rows().map_err(io::Error::other)?,
        plain: text(Format::Plain)?,
        vt: text(Format::Vt)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(s: &Snapshot) -> Vec<&str> {
        s.plain.lines().collect()
    }

    #[test]
    fn snapshots_the_screen_as_text() {
        let s = Screen::new(20, 4).unwrap();
        s.feed(b"\x1b[2J\x1b[Hfirst line\r\nsecond".to_vec());
        let snap = s.snapshot().unwrap();
        assert_eq!((snap.cols, snap.rows), (20, 4));
        assert_eq!(lines(&snap), ["first line", "second"]);
    }

    #[test]
    fn sees_every_chunk_fed_before_the_snapshot() {
        let s = Screen::new(80, 24).unwrap();
        for i in 0..200 {
            s.feed(format!("line {i}\r\n").into_bytes());
        }
        let snap = s.snapshot().unwrap();
        let l = lines(&snap);
        assert_eq!(l.first(), Some(&"line 177"));
        assert_eq!(l.last(), Some(&"line 199"));
    }

    #[test]
    fn keeps_colours_in_the_vt_form() {
        let s = Screen::new(20, 2).unwrap();
        s.feed(b"\x1b[31mred\x1b[0m plain".to_vec());
        let snap = s.snapshot().unwrap();
        assert_eq!(lines(&snap), ["red plain"]);
        assert!(
            snap.vt.contains("\x1b[") && snap.vt.contains("red"),
            "{:?}",
            snap.vt
        );
    }

    #[test]
    fn wraps_at_its_width_and_follows_a_resize() {
        let s = Screen::new(10, 3).unwrap();
        s.feed(b"0123456789abc".to_vec());
        assert_eq!(lines(&s.snapshot().unwrap()), ["0123456789", "abc"]);
        s.resize(30, 5);
        let snap = s.snapshot().unwrap();
        assert_eq!((snap.cols, snap.rows), (30, 5));
    }

    #[test]
    fn a_full_screen_app_snapshots_its_current_frame() {
        let s = Screen::new(20, 3).unwrap();
        s.feed(b"shell prompt\r\n\x1b[?1049h\x1b[2J\x1b[Hmenu\x1b[3;1Hstatus".to_vec());
        assert_eq!(lines(&s.snapshot().unwrap()), ["menu", "", "status"]);
    }
}

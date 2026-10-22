//! Spike 2: headless screen snapshots from libghostty-vt, scripted and from a real vim PTY.
use libghostty_vt::fmt::{Format, Formatter, FormatterOptions};
use libghostty_vt::{Terminal, TerminalOptions};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use std::io::{Read, Write};
use std::time::{Duration, Instant};

fn snapshot(term: &Terminal) -> String {
    let opts = FormatterOptions::new().with_format(Format::Plain).with_trim(true);
    let mut f = Formatter::new(term, opts).expect("formatter");
    let bytes = f.format_alloc(None).expect("format");
    String::from_utf8_lossy(&bytes).into_owned()
}

fn scripted() -> bool {
    let mut term = Terminal::new(TerminalOptions { cols: 80, rows: 24, max_scrollback: 0 }).unwrap();
    term.vt_write(b"\x1b[2J\x1b[H");
    for _ in 0..23 {
        term.vt_write(b"~\r\n");
    }
    term.vt_write(b"\x1b[24;1H\"spike.txt\" 0L, 0B");
    term.vt_write(b"\x1b[1;1Hhello from bezl");
    let text = snapshot(&term);
    let lines: Vec<&str> = text.lines().collect();
    let ok = lines.first() == Some(&"hello from bezl")
        && lines.iter().skip(1).take(22).all(|l| *l == "~")
        && lines.get(23).is_some_and(|l| l.starts_with("\"spike.txt\""));
    println!("scripted ok={ok} lines={}", lines.len());
    if !ok {
        println!("{text}");
    }
    ok
}

fn real_vim() -> bool {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .unwrap();
    let mut cmd = CommandBuilder::new("vim");
    cmd.args(["-u", "NONE", "-n", "-c", "set nocompatible", "spike-vim.txt"]);
    cmd.env("TERM", "xterm-256color");
    let mut child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();
    let mut term = Terminal::new(TerminalOptions { cols: 80, rows: 24, max_scrollback: 0 }).unwrap();
    // Type a line in insert mode, then leave insert mode; snapshot after the screen settles.
    std::thread::sleep(Duration::from_millis(800));
    writer.write_all(b"ibezl was here\x1b").unwrap();
    writer.flush().unwrap();
    let deadline = Instant::now() + Duration::from_millis(1500);
    let mut buf = [0u8; 8192];
    let mut total = 0usize;
    let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });
    while Instant::now() < deadline {
        if let Ok(chunk) = rx.recv_timeout(Duration::from_millis(100)) {
            total += chunk.len();
            term.vt_write(&chunk);
        }
    }
    let text = snapshot(&term);
    let ok = text.lines().next() == Some("bezl was here") && text.lines().count() >= 20;
    println!("real_vim ok={ok} bytes_fed={total}");
    println!("--- vim snapshot (first 4 + last 2 lines) ---");
    let lines: Vec<&str> = text.lines().collect();
    for l in lines.iter().take(4) {
        println!("{l}");
    }
    for l in lines.iter().rev().take(2).collect::<Vec<_>>().into_iter().rev() {
        println!("{l}");
    }
    writer.write_all(b":q!\r").unwrap();
    writer.flush().unwrap();
    let _ = child.wait();
    ok
}

fn main() {
    let a = scripted();
    let b = real_vim();
    println!("spike2 result: scripted={a} real_vim={b}");
    std::process::exit(if a && b { 0 } else { 1 });
}

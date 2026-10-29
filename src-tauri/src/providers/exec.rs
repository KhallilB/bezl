//! Bounded runs of an agent CLI: preflight never waits past its deadline.
use serde::Serialize;
use std::ffi::OsStr;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct Ran {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl Ran {
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }

    /// First line of stdout, else of stderr.
    pub fn says(&self) -> &str {
        match first_line(&self.stdout) {
            "" => first_line(&self.stderr),
            line => line,
        }
    }
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum RunError {
    TimedOut,
    DidNotStart(String),
}

pub fn first_line(text: &str) -> &str {
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
}

pub fn run(
    path: &Path,
    args: &[&str],
    envs: &[(&str, &OsStr)],
    timeout: Duration,
) -> Result<Ran, RunError> {
    let mut child = Command::new(path)
        .args(args)
        .envs(envs.iter().copied())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| RunError::DidNotStart(e.to_string()))?;
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(RunError::TimedOut);
            }
            Err(e) => return Err(RunError::DidNotStart(e.to_string())),
        }
    };
    // A child it left behind can hold the pipes open after it exits.
    let read = |pipe: mpsc::Receiver<String>| {
        pipe.recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .map_err(|_| RunError::TimedOut)
    };
    Ok(Ran {
        code: status.code(),
        stdout: read(stdout)?,
        stderr: read(stderr)?,
    })
}

/// Reader thread is left detached if the pipe outlives the deadline.
fn drain(pipe: Option<impl Read + Send + 'static>) -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        let _ = tx.send(String::from_utf8_lossy(&buf).into_owned());
    });
    rx
}

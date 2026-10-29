use super::Provider;
use std::ffi::OsStr;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, PartialEq, Eq)]
pub enum Identity {
    Known { provider: Provider, version: String },
    Unknown { says: String },
}

pub fn identify(version_output: &str) -> Identity {
    let says = first_line(version_output);
    let known = |provider, version: &str| {
        version
            .starts_with(|c: char| c.is_ascii_digit())
            .then(|| Identity::Known {
                provider,
                version: version.into(),
            })
    };
    says.strip_suffix(" (Claude Code)")
        .and_then(|v| known(Provider::ClaudeCode, v))
        .or_else(|| {
            says.strip_prefix("codex-cli ")
                .and_then(|v| known(Provider::Codex, v))
        })
        .unwrap_or_else(|| Identity::Unknown { says: says.into() })
}

fn first_line(text: &str) -> &str {
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
}

#[derive(Debug, PartialEq, Eq)]
pub struct Discovery {
    pub provider: Provider,
    pub found: Option<Found>,
    /// Same-named binaries before `found` on PATH, or all of them if none matched.
    pub rejected: Vec<Rejected>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Found {
    pub path: PathBuf,
    pub version: String,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Rejected {
    pub path: PathBuf,
    pub reason: Rejection,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Rejection {
    /// First line of its version output, which named no provider or another one.
    Says(String),
    NoOutput,
    Exited {
        code: Option<i32>,
        says: String,
    },
    TimedOut,
    DidNotStart(String),
}

pub fn discover(provider: Provider, search_path: &OsStr, timeout: Duration) -> Discovery {
    let mut rejected = Vec::new();
    for path in candidates(provider.binary_name(), search_path) {
        match check(&path, timeout) {
            Ok((
                Identity::Known {
                    provider: p,
                    version,
                },
                _,
            )) if p == provider => {
                return Discovery {
                    provider,
                    found: Some(Found { path, version }),
                    rejected,
                };
            }
            Ok((_, says)) => rejected.push(Rejected {
                path,
                reason: Rejection::Says(says),
            }),
            Err(reason) => rejected.push(Rejected { path, reason }),
        }
    }
    Discovery {
        provider,
        found: None,
        rejected,
    }
}

fn candidates(name: &str, search_path: &OsStr) -> Vec<PathBuf> {
    let mut seen = Vec::new();
    let mut out = Vec::new();
    for dir in std::env::split_paths(search_path) {
        let path = dir.join(name);
        if !is_executable(&path) {
            continue;
        }
        let real = path.canonicalize().unwrap_or_else(|_| path.clone());
        if !seen.contains(&real) {
            seen.push(real);
            out.push(path);
        }
    }
    out
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// Runs `<path> --version`; returns its identity and first line.
fn check(path: &Path, timeout: Duration) -> Result<(Identity, String), Rejection> {
    let mut child = Command::new(path)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| Rejection::DidNotStart(e.to_string()))?;
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
                return Err(Rejection::TimedOut);
            }
            Err(e) => return Err(Rejection::DidNotStart(e.to_string())),
        }
    };
    // A child it left behind can hold the pipes open after it exits.
    let read = |pipe: mpsc::Receiver<String>| {
        pipe.recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .map_err(|_| Rejection::TimedOut)
    };
    let stdout = read(stdout)?;
    let stderr = read(stderr)?;
    let says = match first_line(&stdout) {
        "" => first_line(&stderr),
        line => line,
    };
    if !status.success() {
        return Err(Rejection::Exited {
            code: status.code(),
            says: says.into(),
        });
    }
    if says.is_empty() {
        return Err(Rejection::NoOutput);
    }
    // Stderr only names what a fake says; identity comes from stdout.
    Ok((identify(&stdout), says.into()))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn known(provider: Provider, version: &str) -> Identity {
        Identity::Known {
            provider,
            version: version.into(),
        }
    }

    fn unknown(says: &str) -> Identity {
        Identity::Unknown { says: says.into() }
    }

    #[test]
    fn identifies_claude_code_from_its_version_line() {
        assert_eq!(
            identify("2.1.312 (Claude Code)\n"),
            known(Provider::ClaudeCode, "2.1.312")
        );
    }

    #[test]
    fn identifies_codex_from_its_version_line() {
        assert_eq!(
            identify("codex-cli 0.163.0\n"),
            known(Provider::Codex, "0.163.0")
        );
    }

    #[test]
    fn a_bare_version_names_no_provider() {
        // The npm `codex` static-site generator found on PATH in spike 3.
        assert_eq!(identify("0.2.3\n"), unknown("0.2.3"));
    }

    #[test]
    fn a_provider_marker_without_a_version_is_unknown() {
        assert_eq!(identify("codex-cli\n"), unknown("codex-cli"));
        assert_eq!(identify("codex-cli banana"), unknown("codex-cli banana"));
        assert_eq!(identify("(Claude Code)"), unknown("(Claude Code)"));
    }

    #[test]
    fn says_is_the_first_non_empty_line() {
        assert_eq!(identify("\n  hugo v0.1  \nmore\n"), unknown("hugo v0.1"));
        assert_eq!(identify(""), unknown(""));
    }

    #[cfg(unix)]
    mod on_path {
        use super::super::*;
        use std::fs;
        use std::os::unix::fs::PermissionsExt;
        use std::path::Path;
        use std::sync::atomic::{AtomicU32, Ordering};

        const TIMEOUT: Duration = Duration::from_secs(5);

        struct Dir(PathBuf);

        impl Dir {
            fn new() -> Self {
                static N: AtomicU32 = AtomicU32::new(0);
                let n = N.fetch_add(1, Ordering::Relaxed);
                let dir =
                    std::env::temp_dir().join(format!("bezl-providers-{}-{n}", std::process::id()));
                let _ = fs::remove_dir_all(&dir);
                fs::create_dir_all(&dir).unwrap();
                Dir(dir)
            }

            fn script(&self, name: &str, body: &str) -> PathBuf {
                let path = self.0.join(name);
                fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
                fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
                path
            }
        }

        impl Drop for Dir {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }

        fn search(dirs: &[&Path]) -> std::ffi::OsString {
            std::env::join_paths(dirs).unwrap()
        }

        fn rejected(path: PathBuf, reason: Rejection) -> Rejected {
            Rejected { path, reason }
        }

        #[test]
        fn finds_codex_by_its_version_output() {
            let dir = Dir::new();
            let path = dir.script("codex", "echo codex-cli 0.163.0");
            let got = discover(Provider::Codex, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(
                got.found,
                Some(Found {
                    path,
                    version: "0.163.0".into()
                })
            );
            assert_eq!(got.rejected, vec![]);
        }

        #[test]
        fn rejects_a_fake_codex_and_reports_what_it_says() {
            let dir = Dir::new();
            let path = dir.script(
                "codex",
                "echo 'Warning: circular dependency' >&2\necho 0.2.3",
            );
            let got = discover(Provider::Codex, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(got.found, None);
            assert_eq!(
                got.rejected,
                vec![rejected(path, Rejection::Says("0.2.3".into()))]
            );
        }

        #[test]
        fn rejects_a_codex_that_says_it_is_claude_code() {
            let dir = Dir::new();
            let path = dir.script("codex", "echo '2.1.312 (Claude Code)'");
            let got = discover(Provider::Codex, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(got.found, None);
            assert_eq!(
                got.rejected,
                vec![rejected(
                    path,
                    Rejection::Says("2.1.312 (Claude Code)".into())
                )]
            );
        }

        #[test]
        fn skips_a_fake_earlier_on_path_for_the_real_one() {
            let fake = Dir::new();
            let real = Dir::new();
            let fake_path = fake.script("codex", "echo 0.2.3");
            let real_path = real.script("codex", "echo codex-cli 0.163.0");
            let got = discover(Provider::Codex, &search(&[&fake.0, &real.0]), TIMEOUT);
            assert_eq!(
                got.found,
                Some(Found {
                    path: real_path,
                    version: "0.163.0".into()
                })
            );
            assert_eq!(
                got.rejected,
                vec![rejected(fake_path, Rejection::Says("0.2.3".into()))]
            );
        }

        #[test]
        fn finds_claude_code_by_its_version_output() {
            let dir = Dir::new();
            let path = dir.script("claude", "echo '2.1.312 (Claude Code)'");
            let got = discover(Provider::ClaudeCode, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(
                got.found,
                Some(Found {
                    path,
                    version: "2.1.312".into()
                })
            );
        }

        #[test]
        fn rejects_a_binary_that_prints_nothing() {
            let dir = Dir::new();
            let path = dir.script("codex", "true");
            let got = discover(Provider::Codex, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(got.rejected, vec![rejected(path, Rejection::NoOutput)]);
        }

        #[test]
        fn reports_stderr_when_stdout_is_empty() {
            let dir = Dir::new();
            let path = dir.script("codex", "echo 'unknown flag --version' >&2");
            let got = discover(Provider::Codex, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(
                got.rejected,
                vec![rejected(
                    path,
                    Rejection::Says("unknown flag --version".into())
                )]
            );
        }

        #[test]
        fn rejects_a_binary_that_exits_with_an_error() {
            let dir = Dir::new();
            let path = dir.script("codex", "echo 'codex-cli 0.163.0'\nexit 3");
            let got = discover(Provider::Codex, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(got.found, None);
            assert_eq!(
                got.rejected,
                vec![rejected(
                    path,
                    Rejection::Exited {
                        code: Some(3),
                        says: "codex-cli 0.163.0".into()
                    }
                )]
            );
        }

        #[test]
        fn rejects_a_binary_that_hangs() {
            let dir = Dir::new();
            let path = dir.script("codex", "exec sleep 5");
            let got = discover(
                Provider::Codex,
                &search(&[&dir.0]),
                Duration::from_millis(200),
            );
            assert_eq!(got.rejected, vec![rejected(path, Rejection::TimedOut)]);
        }

        #[test]
        fn times_out_when_a_child_it_left_behind_holds_stdout() {
            let dir = Dir::new();
            let path = dir.script("codex", "sleep 5 &\necho 0.2.3");
            let started = Instant::now();
            let got = discover(
                Provider::Codex,
                &search(&[&dir.0]),
                Duration::from_millis(200),
            );
            assert!(started.elapsed() < Duration::from_secs(2));
            assert_eq!(got.rejected, vec![rejected(path, Rejection::TimedOut)]);
        }

        #[test]
        fn ignores_files_that_are_not_executable() {
            let dir = Dir::new();
            fs::write(dir.0.join("codex"), "#!/bin/sh\necho codex-cli 0.1.0\n").unwrap();
            let got = discover(Provider::Codex, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(got.found, None);
            assert_eq!(got.rejected, vec![]);
        }

        #[test]
        fn checks_a_binary_once_when_path_repeats_its_dir() {
            let dir = Dir::new();
            let path = dir.script("codex", "echo 0.2.3");
            let got = discover(Provider::Codex, &search(&[&dir.0, &dir.0]), TIMEOUT);
            assert_eq!(
                got.rejected,
                vec![rejected(path, Rejection::Says("0.2.3".into()))]
            );
        }

        #[test]
        fn reports_nothing_when_no_binary_is_on_path() {
            let dir = Dir::new();
            let got = discover(Provider::Codex, &search(&[&dir.0]), TIMEOUT);
            assert_eq!(
                got,
                Discovery {
                    provider: Provider::Codex,
                    found: None,
                    rejected: vec![]
                }
            );
        }
    }
}

//! Terminal snapshots in the record: `<git common dir>/bezl/terminals/<pane>/<taken ms>.json`.
//! Per clone and never tracked; worktrees of one clone share it.
use super::screen::Snapshot;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRef {
    pub pane: String,
    pub taken_at: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    pub pane: String,
    pub taken_at: u64,
    #[serde(flatten)]
    pub snapshot: Snapshot,
}

pub struct Record {
    dir: PathBuf,
}

impl Record {
    /// The record of the clone `cwd` is in. Not in a git checkout: `NotFound`.
    pub fn for_checkout(cwd: &Path) -> io::Result<Record> {
        let out = Command::new("git")
            .args(["rev-parse", "--path-format=absolute", "--git-common-dir"])
            .current_dir(cwd)
            .output()?;
        if !out.status.success() {
            let says = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(io::Error::new(io::ErrorKind::NotFound, says));
        }
        let git = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
        Ok(Record {
            dir: git.join("bezl").join("terminals"),
        })
    }

    pub fn save(&self, pane: &str, taken_at: u64, snapshot: &Snapshot) -> io::Result<SavedRef> {
        let pane = pane_key(pane);
        let dir = self.dir.join(&pane);
        fs::create_dir_all(&dir)?;
        let saved = Saved {
            pane: pane.clone(),
            taken_at,
            snapshot: snapshot.clone(),
        };
        // Written aside, then renamed: a reader never sees half a snapshot.
        let part = dir.join(format!("{taken_at}.json.partial"));
        fs::write(&part, serde_json::to_vec(&saved)?)?;
        fs::rename(&part, dir.join(format!("{taken_at}.json")))?;
        Ok(SavedRef { pane, taken_at })
    }

    /// Newest first.
    pub fn list(&self) -> io::Result<Vec<SavedRef>> {
        let mut all = Vec::new();
        let panes = match fs::read_dir(&self.dir) {
            Ok(panes) => panes,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(all),
            Err(e) => return Err(e),
        };
        for pane in panes {
            let pane = pane?;
            let name = pane.file_name().to_string_lossy().into_owned();
            if pane_key(&name) != name || !pane.file_type()?.is_dir() {
                continue;
            }
            for file in fs::read_dir(pane.path())? {
                let path = file?.path();
                let taken = path
                    .extension()
                    .filter(|e| *e == "json")
                    .and_then(|_| path.file_stem()?.to_str()?.parse().ok());
                if let Some(taken_at) = taken {
                    all.push(SavedRef {
                        pane: name.clone(),
                        taken_at,
                    });
                }
            }
        }
        all.sort_by(|a, b| {
            b.taken_at
                .cmp(&a.taken_at)
                .then_with(|| a.pane.cmp(&b.pane))
        });
        Ok(all)
    }

    pub fn open(&self, pane: &str, taken_at: u64) -> io::Result<Saved> {
        if pane_key(pane) != pane {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("not a pane key: {pane:?}"),
            ));
        }
        let bytes = fs::read(self.dir.join(pane).join(format!("{taken_at}.json")))?;
        Ok(serde_json::from_slice(&bytes)?)
    }
}

/// A pane's folder name: lowercase letters, digits and dashes, never empty.
pub fn pane_key(name: &str) -> String {
    let mut key = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            key.push(c.to_ascii_lowercase());
        } else if !key.is_empty() && !key.ends_with('-') {
            key.push('-');
        }
    }
    let key = key.trim_end_matches('-');
    if key.is_empty() {
        "pane".into()
    } else {
        key.into()
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    struct Repo(PathBuf);

    impl Repo {
        fn new() -> Repo {
            static N: AtomicU32 = AtomicU32::new(0);
            let n = N.fetch_add(1, Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!("bezl-record-{}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            git(&dir, &["init", "-q"]);
            Repo(fs::canonicalize(&dir).unwrap())
        }
    }

    impl Drop for Repo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn git(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .args([
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "-c",
                "commit.gpgSign=false",
            ])
            .args(args)
            .current_dir(dir)
            .status()
            .unwrap()
            .success();
        assert!(ok, "git {args:?}");
    }

    fn snap(text: &str) -> Snapshot {
        Snapshot {
            cols: 80,
            rows: 24,
            plain: text.into(),
            vt: format!("\x1b[0m{text}"),
        }
    }

    #[test]
    fn saves_under_the_git_folder_and_reads_it_back() {
        let repo = Repo::new();
        let record = Record::for_checkout(&repo.0).unwrap();
        let saved = record.save("Shell 1", 1_700, &snap("hello")).unwrap();
        assert_eq!(
            saved,
            SavedRef {
                pane: "shell-1".into(),
                taken_at: 1_700
            }
        );
        assert!(
            repo.0
                .join(".git/bezl/terminals/shell-1/1700.json")
                .is_file()
        );
        let back = record.open("shell-1", 1_700).unwrap();
        assert_eq!(back.snapshot, snap("hello"));
        assert_eq!(back.pane, "shell-1");
    }

    #[test]
    fn writes_nothing_into_the_working_tree() {
        let repo = Repo::new();
        Record::for_checkout(&repo.0)
            .unwrap()
            .save("a", 1, &snap("x"))
            .unwrap();
        let out = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&repo.0)
            .output()
            .unwrap();
        assert!(
            out.stdout.is_empty(),
            "{}",
            String::from_utf8_lossy(&out.stdout)
        );
    }

    #[test]
    fn worktrees_share_the_clone_record() {
        let repo = Repo::new();
        git(&repo.0, &["commit", "-q", "--allow-empty", "-m", "root"]);
        let wt = repo.0.join("wt");
        git(&repo.0, &["worktree", "add", "-q", wt.to_str().unwrap()]);
        Record::for_checkout(&wt)
            .unwrap()
            .save("w", 5, &snap("from worktree"))
            .unwrap();
        assert!(repo.0.join(".git/bezl/terminals/w/5.json").is_file());
    }

    #[test]
    fn lists_every_pane_newest_first() {
        let repo = Repo::new();
        let record = Record::for_checkout(&repo.0).unwrap();
        assert!(record.list().unwrap().is_empty());
        record.save("a", 10, &snap("1")).unwrap();
        record.save("b", 30, &snap("2")).unwrap();
        record.save("a", 20, &snap("3")).unwrap();
        let taken: Vec<(String, u64)> = record
            .list()
            .unwrap()
            .into_iter()
            .map(|r| (r.pane, r.taken_at))
            .collect();
        assert_eq!(
            taken,
            [("b".into(), 30), ("a".into(), 20), ("a".into(), 10)]
        );
    }

    #[test]
    fn outside_a_checkout_there_is_no_record() {
        let dir = std::env::temp_dir().join(format!("bezl-no-git-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let err = Record::for_checkout(&dir).err().unwrap();
        assert_eq!(err.kind(), io::ErrorKind::NotFound);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn opens_only_pane_keys_never_paths() {
        let repo = Repo::new();
        let record = Record::for_checkout(&repo.0).unwrap();
        for bad in ["../x", "a/b", "", "Shell 1"] {
            assert_eq!(
                record.open(bad, 1).unwrap_err().kind(),
                io::ErrorKind::InvalidInput,
                "{bad}"
            );
        }
        assert_eq!(
            record.open("missing", 1).unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
    }

    #[test]
    fn pane_keys_are_folder_safe() {
        assert_eq!(pane_key("Shell 1"), "shell-1");
        assert_eq!(pane_key("../../etc"), "etc");
        assert_eq!(pane_key("Reviewer A  (codex)"), "reviewer-a-codex");
        assert_eq!(pane_key("—"), "pane");
    }
}

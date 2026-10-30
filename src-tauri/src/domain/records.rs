//! A clone's task logs: one JSONL file per task under `<git common dir>/bezl/`, never tracked.
use super::event::{Actor, BatchId, Change, Event, SCHEMA, TaskId};
use super::lease::{HeldLease, conflict};
use super::task::{Refusal, Task};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
pub enum RecordError {
    NotARepo {
        path: PathBuf,
        reason: String,
    },
    Io(io::Error),
    Refused(Refusal),
    TaskExists(TaskId),
    NoTask(TaskId),
    /// A stored line that does not parse or replay. Never repaired silently.
    Corrupt {
        task: TaskId,
        line: usize,
        reason: String,
    },
    /// The last write was cut off; appending would weld onto it.
    TornTail(TaskId),
}

impl fmt::Display for RecordError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RecordError::NotARepo { path, reason } => {
                write!(f, "{} is not a git repository: {reason}", path.display())
            }
            RecordError::Io(e) => write!(f, "{e}"),
            RecordError::Refused(r) => write!(f, "refused: {r}"),
            RecordError::TaskExists(t) => write!(f, "task {t} already exists"),
            RecordError::NoTask(t) => write!(f, "no task {t}"),
            RecordError::Corrupt { task, line, reason } => {
                write!(
                    f,
                    "task {task}'s log is unreadable at line {line}: {reason}"
                )
            }
            RecordError::TornTail(t) => write!(
                f,
                "task {t}'s log ends in a partial write; it must be repaired before recording"
            ),
        }
    }
}

impl std::error::Error for RecordError {}

impl From<io::Error> for RecordError {
    fn from(e: io::Error) -> Self {
        RecordError::Io(e)
    }
}

impl From<Refusal> for RecordError {
    fn from(r: Refusal) -> Self {
        RecordError::Refused(r)
    }
}

#[derive(Debug)]
pub struct Loaded {
    pub task: Task,
    /// A cut-off last line was left out of the replay, and left on disk.
    pub torn_tail: bool,
}

pub struct Records {
    dir: PathBuf,
}

impl Records {
    /// `repo` is any checkout of the clone; linked worktrees share one record.
    pub fn open(repo: &Path) -> Result<Records, RecordError> {
        let not_a_repo = |reason: String| RecordError::NotARepo {
            path: repo.to_path_buf(),
            reason,
        };
        let out = Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(["rev-parse", "--path-format=absolute", "--git-common-dir"])
            .output()
            .map_err(|e| not_a_repo(e.to_string()))?;
        if !out.status.success() {
            return Err(not_a_repo(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            ));
        }
        let common = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Ok(Records {
            dir: PathBuf::from(common).join("bezl"),
        })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Checks `change` against the task and every lease in the clone, then appends it.
    pub fn record(
        &self,
        task: &TaskId,
        actor: Actor,
        batch: Option<BatchId>,
        change: Change,
    ) -> Result<Task, RecordError> {
        fs::create_dir_all(self.dir.join("tasks"))?;
        let _lock = self.lock()?;
        let path = self.log_path(task);
        let creating = matches!(change, Change::TaskCreated { .. });
        if creating && path.exists() {
            return Err(RecordError::TaskExists(task.clone()));
        }

        let current = if creating {
            None
        } else {
            let loaded = self.load(task)?;
            if loaded.torn_tail {
                return Err(RecordError::TornTail(task.clone()));
            }
            Some(loaded.task)
        };
        let event = Event {
            v: SCHEMA,
            seq: current.as_ref().map_or(0, Task::next_seq),
            at_ms: now_ms(),
            task: task.clone(),
            batch,
            actor,
            change,
        };
        let next = match current {
            None => Task::replay([&event])?,
            Some(mut t) => {
                t.apply(&event)?;
                t
            }
        };
        if let Change::WriterLeased { take, scope, .. } = &event.change {
            let held: Vec<HeldLease> = self
                .every_held_lease()?
                .into_iter()
                .filter(|h| !(h.task == *task && h.take == *take))
                .collect();
            if let Some(h) = conflict(&held, scope) {
                return Err(Refusal::LeaseHeld(h.clone()).into());
            }
        }

        let mut line = serde_json::to_vec(&event).map_err(io::Error::other)?;
        line.push(b'\n');
        let mut file = OpenOptions::new()
            .append(true)
            .create_new(creating)
            .open(&path)?;
        // One write per event: a crash leaves at most a torn last line.
        file.write_all(&line)?;
        file.sync_data()?;
        Ok(next)
    }

    /// Rebuilds the task from its log alone.
    pub fn load(&self, task: &TaskId) -> Result<Loaded, RecordError> {
        let bytes = match fs::read(self.log_path(task)) {
            Ok(b) => b,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return Err(RecordError::NoTask(task.clone()));
            }
            Err(e) => return Err(e.into()),
        };
        let mut lines: Vec<&[u8]> = bytes.split(|&b| b == b'\n').collect();
        // Split leaves "" after a final newline; anything else there is a torn write.
        let torn_tail = !lines.pop().unwrap_or_default().is_empty();

        let corrupt = |line: usize, reason: String| RecordError::Corrupt {
            task: task.clone(),
            line,
            reason,
        };
        let mut rebuilt: Option<Task> = None;
        for (i, raw) in lines.iter().enumerate() {
            let event: Event =
                serde_json::from_slice(raw).map_err(|e| corrupt(i + 1, e.to_string()))?;
            match rebuilt.as_mut() {
                None => {
                    rebuilt =
                        Some(Task::replay([&event]).map_err(|r| corrupt(i + 1, r.to_string()))?)
                }
                Some(t) => t.apply(&event).map_err(|r| corrupt(i + 1, r.to_string()))?,
            }
        }
        let task = rebuilt.ok_or_else(|| corrupt(1, "empty log".into()))?;
        Ok(Loaded { task, torn_tail })
    }

    /// Every task in the clone, by id.
    pub fn tasks(&self) -> Result<Vec<Task>, RecordError> {
        let mut ids = Vec::new();
        let entries = match fs::read_dir(self.dir.join("tasks")) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e.into()),
        };
        for entry in entries {
            let name = entry?.file_name();
            let name = name.to_string_lossy();
            if let Some(id) = name
                .strip_suffix(".jsonl")
                .and_then(|s| TaskId::new(s).ok())
            {
                ids.push(id);
            }
        }
        ids.sort();
        ids.iter().map(|id| Ok(self.load(id)?.task)).collect()
    }

    fn every_held_lease(&self) -> Result<Vec<HeldLease>, RecordError> {
        Ok(self.tasks()?.iter().flat_map(Task::held_leases).collect())
    }

    /// Serialises check-then-append across processes on this clone.
    fn lock(&self) -> io::Result<File> {
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(self.dir.join("lock"))?;
        file.lock()?;
        Ok(file)
    }

    fn log_path(&self, task: &TaskId) -> PathBuf {
        self.dir.join("tasks").join(format!("{task}.jsonl"))
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::event::{Agent, AgentId, TakeId};
    use crate::domain::lease::LeaseScope;
    use crate::domain::task::TakeState;
    use crate::providers::Provider;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// A throwaway clone with one commit.
    struct Repo(PathBuf);

    impl Repo {
        fn new() -> Self {
            static N: AtomicU32 = AtomicU32::new(0);
            let n = N.fetch_add(1, Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!("bezl-records-{}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            let repo = Repo(dir.canonicalize().unwrap());
            repo.git(&["init", "-q", "-b", "main"]);
            fs::write(repo.0.join("README.md"), "hi\n").unwrap();
            repo.git(&["add", "."]);
            repo.git(&[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-qm",
                "init",
            ]);
            repo
        }

        fn git(&self, args: &[&str]) -> String {
            let out = Command::new("git")
                .arg("-C")
                .arg(&self.0)
                .args(args)
                .output()
                .unwrap();
            assert!(out.status.success(), "git {args:?}: {out:?}");
            String::from_utf8(out.stdout).unwrap()
        }

        fn records(&self) -> Records {
            Records::open(&self.0).unwrap()
        }
    }

    impl Drop for Repo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn id(s: &str) -> TaskId {
        TaskId::new(s).unwrap()
    }

    fn take(s: &str) -> TakeId {
        TakeId::new(s).unwrap()
    }

    fn writer(s: &str) -> Agent {
        Agent {
            id: AgentId::new(s).unwrap(),
            provider: Provider::Codex,
        }
    }

    fn create(r: &Records, task: &str) -> Task {
        let change = Change::TaskCreated {
            title: format!("task {task}"),
        };
        r.record(&id(task), Actor::Operator, None, change).unwrap()
    }

    fn open_take(r: &Records, task: &str, k: &str, worktree: &Path) {
        let change = Change::TakeOpened {
            take: take(k),
            worktree: worktree.into(),
            base: "b0".into(),
        };
        r.record(&id(task), Actor::Operator, None, change).unwrap();
    }

    fn lease(
        r: &Records,
        task: &str,
        k: &str,
        w: &str,
        worktree: &Path,
    ) -> Result<Task, RecordError> {
        let change = Change::WriterLeased {
            take: take(k),
            writer: writer(w),
            scope: LeaseScope::Worktree {
                path: worktree.into(),
            },
        };
        r.record(&id(task), Actor::Bezl, None, change)
    }

    fn lines(r: &Records, task: &str) -> Vec<String> {
        fs::read_to_string(r.log_path(&id(task)))
            .unwrap()
            .lines()
            .map(String::from)
            .collect()
    }

    #[test]
    fn records_live_in_the_clones_git_dir() {
        let repo = Repo::new();
        assert_eq!(repo.records().dir(), repo.0.join(".git/bezl"));
    }

    #[test]
    fn linked_worktrees_share_the_clones_records() {
        let repo = Repo::new();
        let linked = repo.0.with_extension("linked");
        repo.git(&["worktree", "add", "-q", linked.to_str().unwrap()]);
        let from_linked = Records::open(&linked).unwrap();
        assert_eq!(from_linked.dir(), repo.0.join(".git/bezl"));
        repo.git(&["worktree", "remove", "--force", linked.to_str().unwrap()]);
    }

    #[test]
    fn a_folder_outside_git_is_refused() {
        let dir = std::env::temp_dir().join(format!("bezl-nogit-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert!(matches!(
            Records::open(&dir),
            Err(RecordError::NotARepo { .. })
        ));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn each_change_is_one_versioned_jsonl_line() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        open_take(&r, "t1", "k1", &repo.0);
        let lines = lines(&r, "t1");
        assert_eq!(lines.len(), 2);
        for (seq, line) in lines.iter().enumerate() {
            let e: Event = serde_json::from_str(line).unwrap();
            assert_eq!((e.v, e.seq), (SCHEMA, seq as u64));
        }
    }

    #[test]
    fn a_fresh_reader_rebuilds_the_task_from_the_log() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        open_take(&r, "t1", "k1", &repo.0);
        let written = lease(&r, "t1", "k1", "w1", &repo.0).unwrap();
        let loaded = repo.records().load(&id("t1")).unwrap();
        assert_eq!(loaded.task, written);
        assert!(!loaded.torn_tail);
        assert_eq!(
            loaded.task.take(&take("k1")).unwrap().state,
            TakeState::Ready
        );
    }

    #[test]
    fn creating_a_task_twice_is_refused() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        let again = Change::TaskCreated { title: "x".into() };
        assert!(matches!(
            r.record(&id("t1"), Actor::Operator, None, again),
            Err(RecordError::TaskExists(_))
        ));
    }

    #[test]
    fn change_to_a_missing_task_is_refused() {
        let repo = Repo::new();
        let change = Change::StepStarted { take: take("k1") };
        assert!(matches!(
            repo.records().record(&id("t9"), Actor::Bezl, None, change),
            Err(RecordError::NoTask(_))
        ));
    }

    #[test]
    fn second_writer_on_the_take_is_refused_and_not_logged() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        open_take(&r, "t1", "k1", &repo.0);
        lease(&r, "t1", "k1", "w1", &repo.0).unwrap();
        let before = lines(&r, "t1");
        assert!(matches!(
            lease(&r, "t1", "k1", "w2", &repo.0),
            Err(RecordError::Refused(Refusal::WriterHeld { .. }))
        ));
        assert_eq!(lines(&r, "t1"), before);
    }

    #[test]
    fn second_writer_on_the_worktree_from_another_task_is_refused() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        open_take(&r, "t1", "k1", &repo.0);
        lease(&r, "t1", "k1", "w1", &repo.0).unwrap();
        create(&r, "t2");
        open_take(&r, "t2", "k2", &repo.0);
        match lease(&r, "t2", "k2", "w2", &repo.0) {
            Err(RecordError::Refused(Refusal::LeaseHeld(h))) => {
                assert_eq!((h.task, h.take), (id("t1"), take("k1")));
                assert_eq!(h.writer, AgentId::new("w1").unwrap());
            }
            other => panic!("expected LeaseHeld, got {other:?}"),
        }
        assert_eq!(lines(&r, "t2").len(), 2);
    }

    #[test]
    fn a_stopped_take_frees_the_worktree_for_another_task() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        open_take(&r, "t1", "k1", &repo.0);
        lease(&r, "t1", "k1", "w1", &repo.0).unwrap();
        let stop = Change::TakeStopped {
            take: take("k1"),
            reason: "done".into(),
        };
        r.record(&id("t1"), Actor::Operator, None, stop).unwrap();
        create(&r, "t2");
        open_take(&r, "t2", "k2", &repo.0);
        assert!(lease(&r, "t2", "k2", "w2", &repo.0).is_ok());
    }

    #[test]
    fn batch_id_is_written_on_every_event() {
        let repo = Repo::new();
        let r = repo.records();
        let batch = Some(BatchId::new("b1").unwrap());
        let change = Change::TaskCreated { title: "x".into() };
        r.record(&id("t1"), Actor::Operator, batch.clone(), change)
            .unwrap();
        open_take(&r, "t1", "k1", &repo.0);
        let events: Vec<serde_json::Value> = lines(&r, "t1")
            .iter()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(events[0]["batch"], "b1");
        assert!(events[1]["batch"].is_null());
    }

    #[test]
    fn torn_last_line_is_skipped_on_load_and_blocks_recording() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        open_take(&r, "t1", "k1", &repo.0);
        let path = r.log_path(&id("t1"));
        let mut f = OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(br#"{"v":1,"seq":2,"#).unwrap();
        let loaded = r.load(&id("t1")).unwrap();
        assert!(loaded.torn_tail);
        assert_eq!(loaded.task.next_seq(), 2);
        assert!(matches!(
            lease(&r, "t1", "k1", "w1", &repo.0),
            Err(RecordError::TornTail(_))
        ));
        assert!(fs::read_to_string(&path).unwrap().ends_with(r#""seq":2,"#));
    }

    #[test]
    fn unreadable_line_names_its_line_number() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        let path = r.log_path(&id("t1"));
        let mut f = OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(b"not json\n").unwrap();
        assert!(matches!(
            r.load(&id("t1")),
            Err(RecordError::Corrupt { line: 2, .. })
        ));
    }

    #[test]
    fn line_that_breaks_a_rule_is_corrupt_not_skipped() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        let mut started: serde_json::Value = serde_json::from_str(&lines(&r, "t1")[0]).unwrap();
        started["seq"] = 1.into();
        let path = r.log_path(&id("t1"));
        let mut f = OpenOptions::new().append(true).open(&path).unwrap();
        writeln!(f, "{started}").unwrap();
        assert!(matches!(
            r.load(&id("t1")),
            Err(RecordError::Corrupt { line: 2, .. })
        ));
    }

    #[test]
    fn tasks_lists_every_task_in_the_clone() {
        let repo = Repo::new();
        let r = repo.records();
        assert!(r.tasks().unwrap().is_empty());
        create(&r, "t1");
        create(&r, "t2");
        let ids: Vec<_> = r.tasks().unwrap().into_iter().map(|t| t.id).collect();
        assert_eq!(ids, [id("t1"), id("t2")]);
    }

    // Pass mark: no test writes a tracked file.
    #[test]
    fn recording_leaves_git_status_clean() {
        let repo = Repo::new();
        let r = repo.records();
        create(&r, "t1");
        open_take(&r, "t1", "k1", &repo.0);
        lease(&r, "t1", "k1", "w1", &repo.0).unwrap();
        r.load(&id("t1")).unwrap();
        assert!(r.log_path(&id("t1")).exists());
        let status = repo.git(&[
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--ignored",
        ]);
        assert_eq!(status, "");
    }
}

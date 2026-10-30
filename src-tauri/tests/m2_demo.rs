//! M2's demo on a clone of bezl: a task survives its process being killed.
//! Run with `cargo test --test m2_demo -- --nocapture` to see each step.
use bezl_lib::domain::event::{Actor, Agent, AgentId, Change, TakeId, TaskId};
use bezl_lib::domain::lease::LeaseScope;
use bezl_lib::domain::records::{RecordError, Records};
use bezl_lib::domain::task::{Refusal, TakeState};
use bezl_lib::providers::Provider;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::{env, fs};

const CLONE_VAR: &str = "BEZL_M2_DEMO_CLONE";
const READY: &str = "demo-child: ready to be killed";

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {out:?}");
    String::from_utf8(out.stdout).unwrap()
}

fn ids() -> (TaskId, TakeId) {
    (
        TaskId::new("demo-fix-empty-state").unwrap(),
        TakeId::new("take-1").unwrap(),
    )
}

fn lease(take: &TakeId, writer: &str, worktree: &Path) -> Change {
    Change::WriterLeased {
        take: take.clone(),
        writer: Agent {
            id: AgentId::new(writer).unwrap(),
            provider: Provider::ClaudeCode,
        },
        scope: LeaseScope::Worktree {
            path: worktree.into(),
        },
    }
}

fn expect_second_writer_refused(records: &Records, clone: &Path) {
    let (task, take) = ids();
    match records.record(&task, Actor::Bezl, None, lease(&take, "writer-2", clone)) {
        Err(RecordError::Refused(r @ Refusal::WriterHeld { .. })) => println!("refused: {r}"),
        other => panic!("second writer was not refused: {other:?}"),
    }
}

/// The process the demo kills. Ignored unless the parent starts it.
#[test]
#[ignore]
fn demo_child() {
    let Ok(clone) = env::var(CLONE_VAR) else {
        return;
    };
    let clone = PathBuf::from(clone);
    let records = Records::open(&clone).unwrap();
    let (task, take) = ids();

    let create = Change::TaskCreated {
        title: "Fix empty state".into(),
    };
    records
        .record(&task, Actor::Operator, None, create)
        .unwrap();
    println!("1. created task {task}");
    let open = Change::TakeOpened {
        take: take.clone(),
        worktree: clone.clone(),
        base: git(&clone, &["rev-parse", "HEAD"]).trim().into(),
    };
    records.record(&task, Actor::Operator, None, open).unwrap();
    records
        .record(&task, Actor::Bezl, None, lease(&take, "writer-1", &clone))
        .unwrap();
    let start = Change::StepStarted { take: take.clone() };
    records.record(&task, Actor::Bezl, None, start).unwrap();
    println!("   take {take} running, lease held by writer-1");

    print!("2. second writer on the same worktree: ");
    expect_second_writer_refused(&records, &clone);

    println!("{READY}");
    loop {
        std::thread::park();
    }
}

#[test]
fn demo_task_survives_a_killed_process() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let clone = env::temp_dir().join(format!("bezl-m2-demo-{}", std::process::id()));
    let _ = fs::remove_dir_all(&clone);
    let out = Command::new("git")
        .args(["clone", "-q", "--no-hardlinks"])
        .arg(source)
        .arg(&clone)
        .output()
        .unwrap();
    assert!(out.status.success(), "clone: {out:?}");
    let clone = clone.canonicalize().unwrap();
    println!("0. cloned bezl to {}", clone.display());

    let mut child = Command::new(env::current_exe().unwrap())
        .args(["--exact", "demo_child", "--ignored", "--nocapture"])
        .env(CLONE_VAR, &clone)
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let stdout = BufReader::new(child.stdout.take().unwrap());
    let mut ready = false;
    for line in stdout.lines() {
        let line = line.unwrap();
        if line.contains(READY) {
            ready = true;
            break;
        }
        if line.starts_with("1.") || line.starts_with("   ") || line.starts_with("2.") {
            println!("{line}");
        }
    }
    assert!(ready, "child never got ready");
    child.kill().unwrap(); // SIGKILL on unix: no cleanup runs.
    let status = child.wait().unwrap();
    println!("3. killed the child process ({status})");

    let records = Records::open(&clone).unwrap();
    let (task, take) = ids();
    let loaded = records.load(&task).unwrap();
    assert!(!loaded.torn_tail);
    let rebuilt = loaded.task.take(&take).unwrap();
    assert_eq!(rebuilt.state, TakeState::Running);
    assert_eq!(rebuilt.writer.as_ref().unwrap().id.as_str(), "writer-1");
    println!(
        "4. rebuilt {task} from {}: take {take} {}, writer {}",
        records.dir().join("tasks").display(),
        rebuilt.state.name(),
        rebuilt.writer.as_ref().unwrap().id
    );
    print!("   the lease survived the kill; a second writer is still ");
    expect_second_writer_refused(&records, &clone);

    let status = git(
        &clone,
        &[
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--ignored",
        ],
    );
    println!("5. git status --porcelain --ignored: {:?}", status);
    assert_eq!(status, "", "the demo wrote to the working tree");
    fs::remove_dir_all(&clone).unwrap();
}

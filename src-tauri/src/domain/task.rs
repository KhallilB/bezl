//! The task aggregate: its takes and their states, rebuilt only by replaying events.
use super::event::{Actor, Agent, AgentId, Change, Event, Reviewer, SCHEMA, TakeId, TaskId};
use super::evidence::{Snapshot, VerifyResult, is_current};
use super::lease::{HeldLease, LeaseScope};
use std::collections::BTreeMap;
use std::fmt;
use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Task {
    pub id: TaskId,
    pub title: String,
    pub takes: BTreeMap<TakeId, Take>,
    next_seq: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Take {
    pub id: TakeId,
    pub worktree: PathBuf,
    pub base: String,
    pub state: TakeState,
    /// Holds the lease while set.
    pub writer: Option<Agent>,
    pub reviewers: Vec<Reviewer>,
    /// Commits the writer finished steps at, oldest first.
    pub commits: Vec<String>,
    pub operator_edits: Vec<OperatorEdit>,
    pub evidence: Vec<VerifyResult>,
    /// `operator_edits` before this index reached a writer's brief.
    briefed: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TakeState {
    /// No writer.
    Open,
    /// Writer holds the lease, no step running.
    Ready,
    Running,
    Paused(PauseReason),
    Stopped {
        reason: String,
    },
}

impl TakeState {
    pub fn name(&self) -> &'static str {
        match self {
            TakeState::Open => "open",
            TakeState::Ready => "ready",
            TakeState::Running => "running",
            TakeState::Paused(_) => "paused",
            TakeState::Stopped { .. } => "stopped",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PauseReason {
    OperatorEdit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OperatorEdit {
    pub seq: u64,
    pub paths: Vec<PathBuf>,
    pub uncommitted: Option<String>,
}

/// Why an event was not accepted. Nothing changed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Refusal {
    UnsupportedSchema(u32),
    WrongTask {
        expected: TaskId,
        got: TaskId,
    },
    OutOfOrder {
        expected: u64,
        got: u64,
    },
    NotCreated,
    AlreadyCreated,
    UnknownTake(TakeId),
    TakeExists(TakeId),
    WriterHeld {
        take: TakeId,
        holder: AgentId,
    },
    /// Another take's writer holds an overlapping lease.
    LeaseHeld(HeldLease),
    ScopeMismatch {
        take: TakeId,
    },
    NotReadOnly(AgentId),
    ReviewerExists(AgentId),
    WrongActor {
        change: &'static str,
        expected: &'static str,
    },
    InvalidTransition {
        take: TakeId,
        from: &'static str,
        change: &'static str,
    },
    UnknownCommit(String),
}

impl fmt::Display for Refusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Refusal::UnsupportedSchema(v) => write!(f, "event schema {v} is not supported"),
            Refusal::WrongTask { expected, got } => {
                write!(f, "event for task {got} in the log of task {expected}")
            }
            Refusal::OutOfOrder { expected, got } => {
                write!(f, "expected event {expected}, got {got}")
            }
            Refusal::NotCreated => write!(f, "the log does not start with task_created"),
            Refusal::AlreadyCreated => write!(f, "the task already exists"),
            Refusal::UnknownTake(t) => write!(f, "no take {t}"),
            Refusal::TakeExists(t) => write!(f, "take {t} already exists"),
            Refusal::WriterHeld { take, holder } => {
                write!(f, "take {take} already has a writer: {holder}")
            }
            Refusal::LeaseHeld(h) => write!(
                f,
                "{} is leased to writer {} of take {} in task {}",
                h.scope.worktree().display(),
                h.writer,
                h.take,
                h.task
            ),
            Refusal::ScopeMismatch { take } => {
                write!(f, "the lease must cover take {take}'s own worktree")
            }
            Refusal::NotReadOnly(a) => {
                write!(f, "reviewer {a} can write files: not offered as a reviewer")
            }
            Refusal::ReviewerExists(a) => write!(f, "reviewer {a} is already on the take"),
            Refusal::WrongActor { change, expected } => {
                write!(f, "{change} must come from {expected}")
            }
            Refusal::InvalidTransition { take, from, change } => {
                write!(f, "take {take} is {from}: {change} not allowed")
            }
            Refusal::UnknownCommit(c) => write!(f, "no step of this take finished at {c}"),
        }
    }
}

impl std::error::Error for Refusal {}

impl Task {
    pub fn replay<'a>(events: impl IntoIterator<Item = &'a Event>) -> Result<Task, Refusal> {
        let mut events = events.into_iter();
        let mut task = Task::create(events.next().ok_or(Refusal::NotCreated)?)?;
        for event in events {
            task.apply(event)?;
        }
        Ok(task)
    }

    fn create(event: &Event) -> Result<Task, Refusal> {
        check_schema(event)?;
        let Change::TaskCreated { title } = &event.change else {
            return Err(Refusal::NotCreated);
        };
        if event.seq != 0 {
            return Err(Refusal::OutOfOrder {
                expected: 0,
                got: event.seq,
            });
        }
        Ok(Task {
            id: event.task.clone(),
            title: title.clone(),
            takes: BTreeMap::new(),
            next_seq: 1,
        })
    }

    /// Applies `event` or refuses it, leaving the task as it was.
    pub fn apply(&mut self, event: &Event) -> Result<(), Refusal> {
        check_schema(event)?;
        if event.task != self.id {
            return Err(Refusal::WrongTask {
                expected: self.id.clone(),
                got: event.task.clone(),
            });
        }
        if event.seq != self.next_seq {
            return Err(Refusal::OutOfOrder {
                expected: self.next_seq,
                got: event.seq,
            });
        }
        let id = event.change.take().ok_or(Refusal::AlreadyCreated)?;
        let take = match &event.change {
            Change::TakeOpened { worktree, base, .. } => {
                if self.takes.contains_key(id) {
                    return Err(Refusal::TakeExists(id.clone()));
                }
                Take::open(id.clone(), worktree.clone(), base.clone())
            }
            _ => {
                let mut take = self
                    .takes
                    .get(id)
                    .cloned()
                    .ok_or_else(|| Refusal::UnknownTake(id.clone()))?;
                take.apply(event)?;
                take
            }
        };
        self.takes.insert(id.clone(), take);
        self.next_seq += 1;
        Ok(())
    }

    pub fn next_seq(&self) -> u64 {
        self.next_seq
    }

    pub fn take(&self, id: &TakeId) -> Option<&Take> {
        self.takes.get(id)
    }

    pub fn held_leases(&self) -> Vec<HeldLease> {
        self.takes
            .values()
            .filter_map(|take| {
                Some(HeldLease {
                    task: self.id.clone(),
                    take: take.id.clone(),
                    writer: take.writer.as_ref()?.id.clone(),
                    scope: take.scope(),
                })
            })
            .collect()
    }
}

fn check_schema(event: &Event) -> Result<(), Refusal> {
    if event.v == SCHEMA {
        Ok(())
    } else {
        Err(Refusal::UnsupportedSchema(event.v))
    }
}

impl Take {
    fn open(id: TakeId, worktree: PathBuf, base: String) -> Take {
        Take {
            id,
            worktree,
            base,
            state: TakeState::Open,
            writer: None,
            reviewers: Vec::new(),
            commits: Vec::new(),
            operator_edits: Vec::new(),
            evidence: Vec::new(),
            briefed: 0,
        }
    }

    fn apply(&mut self, event: &Event) -> Result<(), Refusal> {
        let invalid = Refusal::InvalidTransition {
            take: self.id.clone(),
            from: self.state.name(),
            change: event.change.name(),
        };
        let stopped = matches!(self.state, TakeState::Stopped { .. });
        // Evidence may land after a stop: a check that ran still happened.
        if stopped && !matches!(event.change, Change::EvidenceRecorded { .. }) {
            return Err(invalid);
        }
        let operator_only = |change| Refusal::WrongActor {
            change,
            expected: "the operator",
        };

        match &event.change {
            Change::WriterLeased { writer, scope, .. } => {
                if let Some(holder) = &self.writer {
                    return Err(Refusal::WriterHeld {
                        take: self.id.clone(),
                        holder: holder.id.clone(),
                    });
                }
                if *scope != self.scope() {
                    return Err(Refusal::ScopeMismatch {
                        take: self.id.clone(),
                    });
                }
                self.writer = Some(writer.clone());
                self.state = TakeState::Ready;
            }
            Change::LeaseReleased { .. } => {
                if self.state != TakeState::Ready {
                    return Err(invalid);
                }
                self.writer = None;
                self.state = TakeState::Open;
            }
            Change::ReviewerAdded { reviewer, .. } => {
                let id = &reviewer.agent.id;
                if !reviewer.read_only() {
                    return Err(Refusal::NotReadOnly(id.clone()));
                }
                if self.reviewers.iter().any(|r| r.agent.id == *id) {
                    return Err(Refusal::ReviewerExists(id.clone()));
                }
                self.reviewers.push(reviewer.clone());
            }
            Change::StepStarted { .. } => {
                if self.state != TakeState::Ready {
                    return Err(invalid);
                }
                self.state = TakeState::Running;
                self.briefed = self.operator_edits.len();
            }
            Change::StepFinished { commit, .. } => {
                if self.state != TakeState::Running {
                    return Err(invalid);
                }
                let by_writer = matches!(
                    (&event.actor, &self.writer),
                    (Actor::Agent { id }, Some(w)) if *id == w.id
                );
                if !by_writer {
                    return Err(Refusal::WrongActor {
                        change: event.change.name(),
                        expected: "the take's writer",
                    });
                }
                self.commits.push(commit.clone());
                self.state = TakeState::Ready;
            }
            Change::OperatorEdited {
                paths, uncommitted, ..
            } => {
                if event.actor != Actor::Operator {
                    return Err(operator_only(event.change.name()));
                }
                self.operator_edits.push(OperatorEdit {
                    seq: event.seq,
                    paths: paths.clone(),
                    uncommitted: uncommitted.clone(),
                });
                if self.state == TakeState::Running {
                    self.state = TakeState::Paused(PauseReason::OperatorEdit);
                }
            }
            Change::StepResumed { .. } => {
                if !matches!(self.state, TakeState::Paused(_)) {
                    return Err(invalid);
                }
                if event.actor != Actor::Operator {
                    return Err(operator_only(event.change.name()));
                }
                self.state = TakeState::Running;
                self.briefed = self.operator_edits.len();
            }
            Change::EvidenceRecorded { result, .. } => {
                let commit = &result.snapshot.commit;
                if !self.commits.contains(commit) {
                    return Err(Refusal::UnknownCommit(commit.clone()));
                }
                self.evidence.push(result.clone());
            }
            Change::TakeStopped { reason, .. } => {
                self.writer = None;
                self.state = TakeState::Stopped {
                    reason: reason.clone(),
                };
            }
            Change::TaskCreated { .. } | Change::TakeOpened { .. } => return Err(invalid),
        }
        Ok(())
    }

    /// Edits the writer has not been briefed on: they go in its next brief as the operator's.
    pub fn pending_operator_edits(&self) -> &[OperatorEdit] {
        &self.operator_edits[self.briefed..]
    }

    /// The latest result that answers about `now`; older ones are history.
    pub fn current_evidence(&self, now: &Snapshot) -> Option<&VerifyResult> {
        self.evidence
            .iter()
            .rev()
            .find(|r| is_current(&r.snapshot, now))
    }

    fn scope(&self) -> LeaseScope {
        LeaseScope::Worktree {
            path: self.worktree.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::captured::Captured;
    use crate::domain::event::{BatchId, Guard};
    use crate::domain::evidence::VERIFY_SCHEMA;
    use crate::providers::Provider;
    use crate::providers::capabilities::Capability;

    fn task_id() -> TaskId {
        TaskId::new("t1").unwrap()
    }

    fn k1() -> TakeId {
        TakeId::new("k1").unwrap()
    }

    fn agent(id: &str) -> Agent {
        Agent {
            id: AgentId::new(id).unwrap(),
            provider: Provider::ClaudeCode,
        }
    }

    fn as_agent(id: &str) -> Actor {
        Actor::Agent {
            id: AgentId::new(id).unwrap(),
        }
    }

    fn worktree() -> LeaseScope {
        LeaseScope::Worktree {
            path: "/repo/.worktrees/k1".into(),
        }
    }

    /// Builds a log with consecutive seqs.
    struct Log(Vec<Event>);

    impl Log {
        fn new() -> Self {
            let mut log = Log(Vec::new());
            log.push(
                Actor::Operator,
                Change::TaskCreated {
                    title: "Fix empty state".into(),
                },
            );
            log
        }

        fn next(&self, actor: Actor, change: Change) -> Event {
            Event {
                v: SCHEMA,
                seq: self.0.len() as u64,
                at_ms: 1_000 + self.0.len() as u64,
                task: task_id(),
                batch: None,
                actor,
                change,
            }
        }

        fn push(&mut self, actor: Actor, change: Change) -> &mut Self {
            let e = self.next(actor, change);
            self.0.push(e);
            self
        }

        fn open(&mut self) -> &mut Self {
            self.push(
                Actor::Operator,
                Change::TakeOpened {
                    take: k1(),
                    worktree: worktree().worktree().clone(),
                    base: "b0".into(),
                },
            )
        }

        fn lease(&mut self, writer: &str) -> &mut Self {
            self.push(Actor::Bezl, lease(writer))
        }

        fn start(&mut self) -> &mut Self {
            self.push(Actor::Bezl, Change::StepStarted { take: k1() })
        }

        fn finish(&mut self, writer: &str, commit: &str) -> &mut Self {
            self.push(as_agent(writer), finish(commit))
        }

        fn edit(&mut self) -> &mut Self {
            self.push(Actor::Operator, edit())
        }

        fn task(&self) -> Task {
            Task::replay(&self.0).unwrap()
        }

        /// Applies one more event to the replayed task.
        fn try_next(&self, actor: Actor, change: Change) -> (Task, Result<(), Refusal>) {
            let mut task = self.task();
            let result = task.apply(&self.next(actor, change));
            (task, result)
        }

        fn refused(&self, actor: Actor, change: Change) -> Refusal {
            let before = self.task();
            let (after, result) = self.try_next(actor, change);
            assert_eq!(after, before, "a refused event changed the task");
            result.unwrap_err()
        }

        fn state(&self) -> TakeState {
            self.task().take(&k1()).unwrap().state.clone()
        }
    }

    fn lease(writer: &str) -> Change {
        Change::WriterLeased {
            take: k1(),
            writer: agent(writer),
            scope: worktree(),
        }
    }

    fn finish(commit: &str) -> Change {
        Change::StepFinished {
            take: k1(),
            commit: commit.into(),
            output: Some(Captured::new("done")),
        }
    }

    fn edit() -> Change {
        Change::OperatorEdited {
            take: k1(),
            paths: vec!["src/a.ts".into()],
            uncommitted: Some("h1".into()),
        }
    }

    fn resume() -> Change {
        Change::StepResumed { take: k1() }
    }

    fn stop() -> Change {
        Change::TakeStopped {
            take: k1(),
            reason: "operator stopped it".into(),
        }
    }

    fn reviewer(id: &str, writes: Guard) -> Change {
        Change::ReviewerAdded {
            take: k1(),
            reviewer: Reviewer {
                agent: Agent {
                    id: AgentId::new(id).unwrap(),
                    provider: Provider::Codex,
                },
                capabilities: [
                    (Capability::FileWrites, writes),
                    (Capability::Hooks, Guard::InstructionOnly),
                ]
                .into(),
            },
        }
    }

    fn evidence(commit: &str, uncommitted: Option<&str>) -> Change {
        Change::EvidenceRecorded {
            take: k1(),
            result: VerifyResult {
                schema: VERIFY_SCHEMA,
                snapshot: Snapshot {
                    commit: commit.into(),
                    base: "b0".into(),
                    uncommitted: uncommitted.map(Into::into),
                },
                lines: vec![],
                symbols: vec![],
                degradations: vec![],
            },
        }
    }

    fn invalid(from: &'static str, change: &'static str) -> Refusal {
        Refusal::InvalidTransition {
            take: k1(),
            from,
            change,
        }
    }

    // Replay

    #[test]
    fn replay_rebuilds_task_and_take() {
        let mut log = Log::new();
        log.open().lease("w1").start().finish("w1", "c1");
        let task = log.task();
        assert_eq!(task.id, task_id());
        assert_eq!(task.title, "Fix empty state");
        assert_eq!(task.next_seq(), 5);
        let take = task.take(&k1()).unwrap();
        assert_eq!(take.state, TakeState::Ready);
        assert_eq!(take.writer, Some(agent("w1")));
        assert_eq!(take.commits, vec!["c1".to_string()]);
        assert_eq!(take.base, "b0");
    }

    #[test]
    fn replay_is_deterministic() {
        let mut log = Log::new();
        log.open().lease("w1").start().edit();
        assert_eq!(log.task(), log.task());
    }

    #[test]
    fn log_must_start_with_task_created() {
        let log = Log::new();
        let mut opened = log.next(
            Actor::Operator,
            Change::TakeOpened {
                take: k1(),
                worktree: "/w".into(),
                base: "b0".into(),
            },
        );
        opened.seq = 0;
        assert_eq!(Task::replay(&[opened]), Err(Refusal::NotCreated));
        assert_eq!(Task::replay(&[]), Err(Refusal::NotCreated));
    }

    #[test]
    fn task_created_twice_is_refused() {
        let log = Log::new();
        let again = Change::TaskCreated { title: "x".into() };
        assert_eq!(log.refused(Actor::Operator, again), Refusal::AlreadyCreated);
    }

    #[test]
    fn gap_or_repeat_in_seq_is_refused() {
        let log = Log::new();
        let mut e = log.next(Actor::Bezl, Change::StepStarted { take: k1() });
        e.seq = 3;
        let mut task = log.task();
        assert_eq!(
            task.apply(&e),
            Err(Refusal::OutOfOrder {
                expected: 1,
                got: 3
            })
        );
    }

    #[test]
    fn event_for_another_task_is_refused() {
        let log = Log::new();
        let mut e = log.next(Actor::Operator, edit());
        e.task = TaskId::new("t2").unwrap();
        let mut task = log.task();
        assert!(matches!(task.apply(&e), Err(Refusal::WrongTask { .. })));
    }

    #[test]
    fn unknown_schema_version_is_refused() {
        let mut log = Log::new();
        log.0[0].v = SCHEMA + 1;
        assert_eq!(
            Task::replay(&log.0),
            Err(Refusal::UnsupportedSchema(SCHEMA + 1))
        );
    }

    #[test]
    fn batch_id_is_carried_without_changing_the_rules() {
        let mut log = Log::new();
        log.open();
        log.0[1].batch = Some(BatchId::new("b1").unwrap());
        assert_eq!(log.state(), TakeState::Open);
    }

    // Takes

    #[test]
    fn take_opens_without_a_writer() {
        let mut log = Log::new();
        log.open();
        let take = log.task().take(&k1()).cloned().unwrap();
        assert_eq!(take.state, TakeState::Open);
        assert_eq!(take.writer, None);
        assert_eq!(take.worktree, PathBuf::from("/repo/.worktrees/k1"));
    }

    #[test]
    fn opening_the_same_take_twice_is_refused() {
        let mut log = Log::new();
        log.open();
        let again = log.0[1].change.clone();
        assert_eq!(
            log.refused(Actor::Operator, again),
            Refusal::TakeExists(k1())
        );
    }

    #[test]
    fn change_to_unknown_take_is_refused() {
        let log = Log::new();
        assert_eq!(
            log.refused(Actor::Bezl, lease("w1")),
            Refusal::UnknownTake(k1())
        );
    }

    // Lease

    #[test]
    fn writer_lease_moves_open_to_ready() {
        let mut log = Log::new();
        log.open().lease("w1");
        assert_eq!(log.state(), TakeState::Ready);
        assert_eq!(
            log.task().held_leases(),
            vec![HeldLease {
                task: task_id(),
                take: k1(),
                writer: AgentId::new("w1").unwrap(),
                scope: worktree(),
            }]
        );
    }

    #[test]
    fn second_writer_is_refused_in_every_held_state() {
        let mut log = Log::new();
        log.open().lease("w1");
        let held = Refusal::WriterHeld {
            take: k1(),
            holder: AgentId::new("w1").unwrap(),
        };
        assert_eq!(log.refused(Actor::Bezl, lease("w2")), held, "ready");
        log.start();
        assert_eq!(log.refused(Actor::Bezl, lease("w2")), held, "running");
        log.edit();
        assert_eq!(log.refused(Actor::Bezl, lease("w2")), held, "paused");
    }

    #[test]
    fn lease_must_cover_the_takes_own_worktree() {
        let mut log = Log::new();
        log.open();
        let elsewhere = Change::WriterLeased {
            take: k1(),
            writer: agent("w1"),
            scope: LeaseScope::Worktree {
                path: "/somewhere/else".into(),
            },
        };
        assert_eq!(
            log.refused(Actor::Bezl, elsewhere),
            Refusal::ScopeMismatch { take: k1() }
        );
    }

    #[test]
    fn released_lease_moves_ready_to_open_and_frees_the_worktree() {
        let mut log = Log::new();
        log.open().lease("w1");
        log.push(Actor::Bezl, Change::LeaseReleased { take: k1() });
        assert_eq!(log.state(), TakeState::Open);
        assert!(log.task().held_leases().is_empty());
        log.lease("w2");
        assert_eq!(log.task().take(&k1()).unwrap().writer, Some(agent("w2")));
    }

    #[test]
    fn lease_cannot_be_released_mid_step_or_without_a_writer() {
        let mut log = Log::new();
        log.open();
        let release = || Change::LeaseReleased { take: k1() };
        assert_eq!(
            log.refused(Actor::Bezl, release()),
            invalid("open", "lease_released")
        );
        log.lease("w1").start();
        assert_eq!(
            log.refused(Actor::Bezl, release()),
            invalid("running", "lease_released")
        );
        log.edit();
        assert_eq!(
            log.refused(Actor::Bezl, release()),
            invalid("paused", "lease_released")
        );
    }

    // Steps

    #[test]
    fn step_moves_ready_to_running_and_back_with_its_commit() {
        let mut log = Log::new();
        log.open().lease("w1").start();
        assert_eq!(log.state(), TakeState::Running);
        log.finish("w1", "c1");
        assert_eq!(log.state(), TakeState::Ready);
        log.start().finish("w1", "c2");
        assert_eq!(log.task().take(&k1()).unwrap().commits, ["c1", "c2"]);
    }

    #[test]
    fn step_needs_a_writer_and_no_step_running() {
        let mut log = Log::new();
        log.open();
        let start = || Change::StepStarted { take: k1() };
        assert_eq!(
            log.refused(Actor::Bezl, start()),
            invalid("open", "step_started")
        );
        log.lease("w1").start();
        assert_eq!(
            log.refused(Actor::Bezl, start()),
            invalid("running", "step_started")
        );
        log.edit();
        assert_eq!(
            log.refused(Actor::Bezl, start()),
            invalid("paused", "step_started")
        );
    }

    #[test]
    fn only_a_running_step_can_finish() {
        let mut log = Log::new();
        log.open();
        assert_eq!(
            log.refused(as_agent("w1"), finish("c1")),
            invalid("open", "step_finished")
        );
        log.lease("w1");
        assert_eq!(
            log.refused(as_agent("w1"), finish("c1")),
            invalid("ready", "step_finished")
        );
        log.start().edit();
        assert_eq!(
            log.refused(as_agent("w1"), finish("c1")),
            invalid("paused", "step_finished")
        );
    }

    #[test]
    fn only_the_lease_holder_finishes_a_step() {
        let mut log = Log::new();
        log.open().lease("w1").start();
        let wrong = Refusal::WrongActor {
            change: "step_finished",
            expected: "the take's writer",
        };
        assert_eq!(log.refused(as_agent("w2"), finish("c1")), wrong);
        assert_eq!(log.refused(Actor::Operator, finish("c1")), wrong);
    }

    // Operator edits

    #[test]
    fn operator_edit_pauses_a_running_take_and_writer_keeps_the_lease() {
        let mut log = Log::new();
        log.open().lease("w1").start().edit();
        let task = log.task();
        let take = task.take(&k1()).unwrap();
        assert_eq!(take.state, TakeState::Paused(PauseReason::OperatorEdit));
        assert_eq!(take.writer, Some(agent("w1")));
        assert_eq!(task.held_leases().len(), 1);
        assert_eq!(
            take.operator_edits,
            vec![OperatorEdit {
                seq: 4,
                paths: vec!["src/a.ts".into()],
                uncommitted: Some("h1".into()),
            }]
        );
    }

    #[test]
    fn operator_edit_outside_a_step_is_recorded_without_a_pause() {
        let mut log = Log::new();
        log.open().edit();
        assert_eq!(log.state(), TakeState::Open);
        log.lease("w1").edit();
        assert_eq!(log.state(), TakeState::Ready);
        assert_eq!(log.task().take(&k1()).unwrap().operator_edits.len(), 2);
    }

    #[test]
    fn edit_by_anyone_but_the_operator_is_refused() {
        let mut log = Log::new();
        log.open().lease("w1").start();
        let wrong = Refusal::WrongActor {
            change: "operator_edited",
            expected: "the operator",
        };
        assert_eq!(log.refused(as_agent("w1"), edit()), wrong);
        assert_eq!(log.refused(Actor::Bezl, edit()), wrong);
    }

    #[test]
    fn edits_stay_pending_until_the_writer_resumes() {
        let mut log = Log::new();
        log.open().lease("w1").start().edit().edit();
        let pending = |log: &Log| {
            log.task()
                .take(&k1())
                .unwrap()
                .pending_operator_edits()
                .len()
        };
        assert_eq!(pending(&log), 2);
        log.push(Actor::Operator, resume());
        assert_eq!(log.state(), TakeState::Running);
        assert_eq!(pending(&log), 0);
        log.finish("w1", "c1").edit();
        assert_eq!(pending(&log), 1);
        log.start();
        assert_eq!(pending(&log), 0);
    }

    #[test]
    fn only_the_operator_resumes_a_paused_take() {
        let mut log = Log::new();
        log.open().lease("w1").start();
        assert_eq!(
            log.refused(Actor::Operator, resume()),
            invalid("running", "step_resumed")
        );
        log.edit();
        assert_eq!(
            log.refused(as_agent("w1"), resume()),
            Refusal::WrongActor {
                change: "step_resumed",
                expected: "the operator",
            }
        );
    }

    // Reviewers

    #[test]
    fn read_only_reviewers_join_with_their_capabilities() {
        let mut log = Log::new();
        log.open()
            .push(Actor::Operator, reviewer("r1", Guard::Blocked))
            .push(Actor::Operator, reviewer("r2", Guard::Blocked));
        let take = log.task().take(&k1()).cloned().unwrap();
        assert_eq!(take.reviewers.len(), 2);
        assert_eq!(
            take.reviewers[0].capabilities[&Capability::Hooks],
            Guard::InstructionOnly
        );
    }

    #[test]
    fn reviewer_that_can_write_files_is_refused() {
        let mut log = Log::new();
        log.open();
        assert_eq!(
            log.refused(Actor::Operator, reviewer("r1", Guard::InstructionOnly)),
            Refusal::NotReadOnly(AgentId::new("r1").unwrap())
        );
    }

    #[test]
    fn same_reviewer_twice_is_refused() {
        let mut log = Log::new();
        log.open()
            .push(Actor::Operator, reviewer("r1", Guard::Blocked));
        assert_eq!(
            log.refused(Actor::Operator, reviewer("r1", Guard::Blocked)),
            Refusal::ReviewerExists(AgentId::new("r1").unwrap())
        );
    }

    // Evidence

    #[test]
    fn evidence_is_bound_to_a_commit_the_writer_finished() {
        let mut log = Log::new();
        log.open().lease("w1").start().finish("w1", "c1");
        assert_eq!(
            log.refused(Actor::Bezl, evidence("c9", None)),
            Refusal::UnknownCommit("c9".into())
        );
        log.push(Actor::Bezl, evidence("c1", None));
        assert_eq!(log.task().take(&k1()).unwrap().evidence.len(), 1);
    }

    #[test]
    fn only_evidence_for_the_current_snapshot_is_current() {
        let mut log = Log::new();
        log.open().lease("w1").start().finish("w1", "c1");
        log.push(Actor::Bezl, evidence("c1", None))
            .push(Actor::Bezl, evidence("c1", Some("h1")));
        let task = log.task();
        let take = task.take(&k1()).unwrap();
        let at = |uncommitted: Option<&str>| Snapshot {
            commit: "c1".into(),
            base: "b0".into(),
            uncommitted: uncommitted.map(Into::into),
        };
        assert_eq!(take.current_evidence(&at(None)), Some(&take.evidence[0]));
        assert_eq!(
            take.current_evidence(&at(Some("h1"))),
            Some(&take.evidence[1])
        );
        assert_eq!(take.current_evidence(&at(Some("h2"))), None);
    }

    // Stop

    #[test]
    fn stop_ends_every_live_state_and_releases_the_lease() {
        let setups: [fn(&mut Log); 4] = [
            |l| {
                l.open();
            },
            |l| {
                l.open().lease("w1");
            },
            |l| {
                l.open().lease("w1").start();
            },
            |l| {
                l.open().lease("w1").start().edit();
            },
        ];
        for setup in setups {
            let mut log = Log::new();
            setup(&mut log);
            log.push(Actor::Operator, stop());
            let task = log.task();
            let take = task.take(&k1()).unwrap();
            assert_eq!(
                take.state,
                TakeState::Stopped {
                    reason: "operator stopped it".into()
                }
            );
            assert_eq!(take.writer, None);
            assert!(task.held_leases().is_empty());
        }
    }

    #[test]
    fn stopped_take_refuses_every_change() {
        let mut log = Log::new();
        log.open().lease("w1").start().finish("w1", "c1");
        log.push(Actor::Operator, stop());
        let attempts = [
            (Actor::Bezl, lease("w2")),
            (Actor::Bezl, Change::LeaseReleased { take: k1() }),
            (Actor::Bezl, Change::StepStarted { take: k1() }),
            (as_agent("w1"), finish("c2")),
            (Actor::Operator, edit()),
            (Actor::Operator, resume()),
            (Actor::Operator, reviewer("r1", Guard::Blocked)),
            (Actor::Operator, stop()),
        ];
        for (actor, change) in attempts {
            let name = change.name();
            assert_eq!(log.refused(actor, change), invalid("stopped", name));
        }
    }

    #[test]
    fn evidence_still_lands_on_a_stopped_take() {
        let mut log = Log::new();
        log.open().lease("w1").start().finish("w1", "c1");
        log.push(Actor::Operator, stop())
            .push(Actor::Bezl, evidence("c1", None));
        assert_eq!(log.task().take(&k1()).unwrap().evidence.len(), 1);
    }
}

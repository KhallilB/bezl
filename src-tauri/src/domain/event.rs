//! One line of a task's log. Every state change is one of these.
use super::captured::Captured;
use super::evidence::VerifyResult;
use super::lease::LeaseScope;
use super::redact::{Redaction, Secrets};
use crate::providers::Provider;
use crate::providers::capabilities::Capability;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;
use std::path::PathBuf;

/// Bump on any change an old reader would misread; replay refuses other versions.
pub const SCHEMA: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InvalidId(pub String);

impl fmt::Display for InvalidId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "not a valid id: {:?}", self.0)
    }
}

impl std::error::Error for InvalidId {}

// Ids name files under `.git/bezl/`: no separators, no leading dot.
fn valid_id(s: &str) -> bool {
    (1..=64).contains(&s.len())
        && !s.starts_with('.')
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}

macro_rules! id {
    ($name:ident) => {
        #[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(try_from = "String", into = "String")]
        pub struct $name(String);

        impl $name {
            pub fn new(s: impl Into<String>) -> Result<Self, InvalidId> {
                let s = s.into();
                if valid_id(&s) {
                    Ok($name(s))
                } else {
                    Err(InvalidId(s))
                }
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl TryFrom<String> for $name {
            type Error = InvalidId;
            fn try_from(s: String) -> Result<Self, InvalidId> {
                $name::new(s)
            }
        }

        impl From<$name> for String {
            fn from(id: $name) -> String {
                id.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(&self.0)
            }
        }
    };
}

id!(TaskId);
id!(TakeId);
id!(AgentId);
id!(BatchId);

/// Who caused a change. Edits are credited by this, never guessed.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Actor {
    Operator,
    Bezl,
    Agent { id: AgentId },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Agent {
    pub id: AgentId,
    pub provider: Provider,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Guard {
    Blocked,
    InstructionOnly,
}

/// A capability missing from the map is open.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Reviewer {
    pub agent: Agent,
    pub capabilities: BTreeMap<Capability, Guard>,
}

impl Reviewer {
    pub fn read_only(&self) -> bool {
        self.capabilities.get(&Capability::FileWrites) == Some(&Guard::Blocked)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub v: u32,
    /// Position in the task's log, from 0; replay refuses gaps.
    pub seq: u64,
    pub at_ms: u64,
    pub task: TaskId,
    /// Always written, `null` outside a batch: batches must not migrate the schema.
    pub batch: Option<BatchId>,
    pub actor: Actor,
    /// Secrets taken out of this event's captured text before it was written.
    pub redactions: Vec<Redaction>,
    #[serde(flatten)]
    pub change: Change,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Change {
    TaskCreated {
        title: String,
    },
    TakeOpened {
        take: TakeId,
        worktree: PathBuf,
        base: String,
    },
    WriterLeased {
        take: TakeId,
        writer: Agent,
        scope: LeaseScope,
    },
    LeaseReleased {
        take: TakeId,
    },
    ReviewerAdded {
        take: TakeId,
        reviewer: Reviewer,
    },
    StepStarted {
        take: TakeId,
    },
    StepFinished {
        take: TakeId,
        commit: String,
        output: Option<Captured>,
    },
    /// Operator's uncommitted edits. At a step boundary: a change of its own.
    /// During a step: indistinguishable from the writer's, so that step is mixed.
    OperatorChanged {
        take: TakeId,
        paths: Vec<PathBuf>,
        uncommitted: Option<String>,
    },
    /// Stops the take at the next step boundary, so the operator can edit.
    PauseRequested {
        take: TakeId,
    },
    TakeResumed {
        take: TakeId,
    },
    EvidenceRecorded {
        take: TakeId,
        result: VerifyResult,
    },
    /// `reason` is Bezl's sentence; `detail` holds what a CLI said, if any.
    TakeStopped {
        take: TakeId,
        reason: String,
        detail: Option<Captured>,
    },
}

impl Change {
    /// `None` for `TaskCreated`, the one change above every take.
    pub fn take(&self) -> Option<&TakeId> {
        match self {
            Change::TaskCreated { .. } => None,
            Change::TakeOpened { take, .. }
            | Change::WriterLeased { take, .. }
            | Change::LeaseReleased { take }
            | Change::ReviewerAdded { take, .. }
            | Change::StepStarted { take }
            | Change::StepFinished { take, .. }
            | Change::OperatorChanged { take, .. }
            | Change::PauseRequested { take }
            | Change::TakeResumed { take }
            | Change::EvidenceRecorded { take, .. }
            | Change::TakeStopped { take, .. } => Some(take),
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Change::TaskCreated { .. } => "task_created",
            Change::TakeOpened { .. } => "take_opened",
            Change::WriterLeased { .. } => "writer_leased",
            Change::LeaseReleased { .. } => "lease_released",
            Change::ReviewerAdded { .. } => "reviewer_added",
            Change::StepStarted { .. } => "step_started",
            Change::StepFinished { .. } => "step_finished",
            Change::OperatorChanged { .. } => "operator_changed",
            Change::PauseRequested { .. } => "pause_requested",
            Change::TakeResumed { .. } => "take_resumed",
            Change::EvidenceRecorded { .. } => "evidence_recorded",
            Change::TakeStopped { .. } => "take_stopped",
        }
    }

    /// Redacts every captured field in place; returns each secret found, once.
    pub fn redact(&mut self, secrets: &Secrets) -> Vec<Redaction> {
        let fields = match self {
            Change::StepFinished { output, .. } => vec![output],
            Change::TakeStopped { detail, .. } => vec![detail],
            _ => vec![],
        };
        let mut found: Vec<Redaction> = Vec::new();
        for captured in fields.into_iter().flatten() {
            let (text, redactions) = secrets.redact(&captured.text);
            captured.text = text;
            for r in redactions {
                if !found.contains(&r) {
                    found.push(r);
                }
            }
        }
        found
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn ids_refuse_path_separators_and_dots() {
        assert!(TaskId::new("fix-empty-state_2").is_ok());
        for bad in ["", "../x", "a/b", ".hidden", "a b", &"x".repeat(65)] {
            assert!(TaskId::new(bad).is_err(), "{bad:?}");
        }
        assert!(serde_json::from_value::<TaskId>(json!("a/b")).is_err());
    }

    #[test]
    fn event_json_is_flat_with_type_actor_and_null_batch() {
        let e = Event {
            v: SCHEMA,
            seq: 2,
            at_ms: 7,
            task: TaskId::new("t1").unwrap(),
            batch: None,
            actor: Actor::Operator,
            redactions: vec![],
            change: Change::OperatorChanged {
                take: TakeId::new("k1").unwrap(),
                paths: vec!["src/a.ts".into()],
                uncommitted: Some("h1".into()),
            },
        };
        let raw = json!({"v": 1, "seq": 2, "at_ms": 7, "task": "t1", "batch": null,
            "actor": {"kind": "operator"}, "redactions": [], "type": "operator_changed",
            "take": "k1", "paths": ["src/a.ts"], "uncommitted": "h1"});
        assert_eq!(serde_json::to_value(&e).unwrap(), raw);
        assert_eq!(serde_json::from_value::<Event>(raw).unwrap(), e);
    }

    #[test]
    fn redact_cleans_step_output_and_stop_detail() {
        let secrets = Secrets::from_env([("API_KEY".to_string(), "sk-live-123456".to_string())]);
        let hash = super::super::redact::short_hash("sk-live-123456");
        let token = super::super::redact::token(&hash);
        let k1 = TakeId::new("k1").unwrap();

        let mut finished = Change::StepFinished {
            take: k1.clone(),
            commit: "c1".into(),
            output: Some(Captured::new("key sk-live-123456 and sk-live-123456")),
        };
        let found = finished.redact(&secrets);
        let want = vec![Redaction {
            rule: "env:API_KEY".into(),
            hash: hash.clone(),
        }];
        assert_eq!(found, want);
        let Change::StepFinished { output, .. } = &finished else {
            unreachable!()
        };
        assert_eq!(
            output.as_ref().unwrap().text,
            format!("key {token} and {token}")
        );

        let mut stopped = Change::TakeStopped {
            take: k1,
            reason: "Claude Code exited".into(),
            detail: Some(Captured::new("auth sk-live-123456 rejected")),
        };
        assert_eq!(stopped.redact(&secrets), want);
        let Change::TakeStopped { detail, .. } = &stopped else {
            unreachable!()
        };
        assert_eq!(
            detail.as_ref().unwrap().text,
            format!("auth {token} rejected")
        );
    }

    #[test]
    fn reviewer_is_read_only_only_when_file_writes_are_blocked() {
        let agent = Agent {
            id: AgentId::new("r1").unwrap(),
            provider: Provider::Codex,
        };
        let with = |guard| Reviewer {
            agent: agent.clone(),
            capabilities: [(Capability::FileWrites, guard)].into(),
        };
        assert!(with(Guard::Blocked).read_only());
        assert!(!with(Guard::InstructionOnly).read_only());
        let none = Reviewer {
            agent: agent.clone(),
            capabilities: BTreeMap::new(),
        };
        assert!(!none.read_only());
    }
}

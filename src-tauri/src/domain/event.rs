//! One line of a task's log. Every state change is one of these.
use super::captured::Captured;
use super::evidence::VerifyResult;
use super::lease::LeaseScope;
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
    /// Paths and worktree hash after the edit; the writer keeps the lease.
    OperatorEdited {
        take: TakeId,
        paths: Vec<PathBuf>,
        uncommitted: Option<String>,
    },
    StepResumed {
        take: TakeId,
    },
    EvidenceRecorded {
        take: TakeId,
        result: VerifyResult,
    },
    TakeStopped {
        take: TakeId,
        reason: String,
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
            | Change::OperatorEdited { take, .. }
            | Change::StepResumed { take }
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
            Change::OperatorEdited { .. } => "operator_edited",
            Change::StepResumed { .. } => "step_resumed",
            Change::EvidenceRecorded { .. } => "evidence_recorded",
            Change::TakeStopped { .. } => "take_stopped",
        }
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
            change: Change::OperatorEdited {
                take: TakeId::new("k1").unwrap(),
                paths: vec!["src/a.ts".into()],
                uncommitted: Some("h1".into()),
            },
        };
        let raw = json!({"v": 1, "seq": 2, "at_ms": 7, "task": "t1", "batch": null,
            "actor": {"kind": "operator"}, "type": "operator_edited",
            "take": "k1", "paths": ["src/a.ts"], "uncommitted": "h1"});
        assert_eq!(serde_json::to_value(&e).unwrap(), raw);
        assert_eq!(serde_json::from_value::<Event>(raw).unwrap(), e);
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

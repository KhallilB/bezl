//! The writer lease: one writer per worktree, across every task in the clone.
use super::event::{AgentId, TakeId, TaskId};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// What a lease covers. Batches will add a set of paths inside a worktree as a variant.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum LeaseScope {
    Worktree { path: PathBuf },
}

impl LeaseScope {
    pub fn worktree(&self) -> &PathBuf {
        match self {
            LeaseScope::Worktree { path } => path,
        }
    }

    pub fn overlaps(&self, other: &LeaseScope) -> bool {
        match (self, other) {
            (LeaseScope::Worktree { path: a }, LeaseScope::Worktree { path: b }) => a == b,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HeldLease {
    pub task: TaskId,
    pub take: TakeId,
    pub writer: AgentId,
    pub scope: LeaseScope,
}

/// The lease that stands in the way of `scope`, if any.
pub fn conflict<'a>(held: &'a [HeldLease], scope: &LeaseScope) -> Option<&'a HeldLease> {
    held.iter().find(|h| h.scope.overlaps(scope))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn worktree(p: &str) -> LeaseScope {
        LeaseScope::Worktree { path: p.into() }
    }

    fn held(take: &str, p: &str) -> HeldLease {
        HeldLease {
            task: TaskId::new("t1").unwrap(),
            take: TakeId::new(take).unwrap(),
            writer: AgentId::new("w1").unwrap(),
            scope: worktree(p),
        }
    }

    #[test]
    fn same_worktree_overlaps_other_does_not() {
        assert!(worktree("/r/a").overlaps(&worktree("/r/a")));
        assert!(!worktree("/r/a").overlaps(&worktree("/r/b")));
    }

    #[test]
    fn conflict_names_the_holder() {
        let leases = [held("k1", "/r/a"), held("k2", "/r/b")];
        assert_eq!(
            conflict(&leases, &worktree("/r/b")).map(|h| h.take.as_str()),
            Some("k2")
        );
        assert_eq!(conflict(&leases, &worktree("/r/c")), None);
    }

    #[test]
    fn scope_json_is_tagged_so_path_sets_can_be_added() {
        assert_eq!(
            serde_json::to_value(worktree("/r/a")).unwrap(),
            serde_json::json!({"kind": "worktree", "path": "/r/a"})
        );
    }
}

//! The evidence engine's result types. JSON matches the TypeScript engine's, field for field.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// New-side changed line numbers per file.
pub type ChangedLines = BTreeMap<String, BTreeSet<u32>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Bucket {
    Covered,
    Uncovered,
    Unknown,
    Excluded,
}

pub const BUCKETS: [Bucket; 4] = [
    Bucket::Covered,
    Bucket::Uncovered,
    Bucket::Unknown,
    Bucket::Excluded,
];

/// Why a line is out of the sheet. `NonExecutable`: no test can run it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Exclusion {
    Generated,
    Test,
    NotSource,
    NonExecutable,
}

/// One changed line at the pin; its bucket is a field, so at most one per entry.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LineEntry {
    pub file: String,
    pub line: u32,
    /// `SymbolEntry::id`; `None` outside every symbol.
    pub symbol: Option<String>,
    #[serde(flatten)]
    pub sort: Sorted,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "bucket", rename_all = "lowercase")]
pub enum Sorted {
    Covered {
        producer: String,
    },
    Uncovered {
        producer: String,
    },
    /// Index into `VerifyResult::degradations`: an unknown line always says why.
    Unknown {
        degradation: usize,
    },
    Excluded {
        reason: Exclusion,
    },
}

impl Sorted {
    pub fn bucket(&self) -> Bucket {
        match self {
            Sorted::Covered { .. } => Bucket::Covered,
            Sorted::Uncovered { .. } => Bucket::Uncovered,
            Sorted::Unknown { .. } => Bucket::Unknown,
            Sorted::Excluded { .. } => Bucket::Excluded,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Removed,
    Renamed,
    Signature,
    Body,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Attention,
    Low,
}

/// Low tiers, in precedence order.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LowRule {
    OutOfScope,
    EntryGlue,
    TextOnly,
    LoggingOnly,
    Data,
    Small,
}

/// Out of scope wins over any trivial rule.
pub fn tier_of(trivial: Option<LowRule>, in_scope: bool) -> (Tier, Option<LowRule>) {
    match (in_scope, trivial) {
        (false, _) => (Tier::Low, Some(LowRule::OutOfScope)),
        (true, Some(rule)) => (Tier::Low, Some(rule)),
        (true, None) => (Tier::Attention, None),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Certainty {
    Exact,
    Likely,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BoundarySource {
    Infigraph,
    ScipTypescript,
    TreeSitter,
    LanguageServer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lookup {
    Outline,
    Changed,
    Callers,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolEntry {
    /// `path::name`, infigraph's full symbol ID form.
    pub id: String,
    pub file: String,
    pub name: String,
    pub kind: String,
    pub start_line: u32,
    pub end_line: u32,
    pub change: ChangeKind,
    pub source: BoundarySource,
    pub certainty: Certainty,
    /// `None` for a removed symbol: no new-side code to judge.
    pub tier: Option<Tier>,
    /// Why the symbol is low; `None` in attention.
    pub rule: Option<LowRule>,
}

/// Something Bezl could not measure, stated in the result instead of hidden.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Degradation {
    NoCoverage {
        language: String,
        reason: String,
    },
    CoverageUnreadable {
        producer: String,
        reason: String,
    },
    SymbolUnresolved {
        file: String,
        reason: String,
    },
    /// A runner tested `scope` without coverage, so its silence proves nothing.
    RunnerWithoutCoverage {
        runner: String,
        scope: String,
        reason: String,
    },
    DoneWhenUnmeasured {
        command: String,
        reason: String,
    },
    /// Nothing could scope the run, so every symbol is in scope.
    NoScope {
        reason: String,
    },
    SourceUnknown {
        source: BoundarySource,
        lookup: Lookup,
        reason: String,
    },
}

/// The state a result answers about. Compare with `is_current` before showing it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Snapshot {
    pub commit: String,
    pub base: String,
    /// `hashUncommitted` of the worktree at run time; `None` when clean.
    pub uncommitted: Option<String>,
}

pub fn is_current(bound: &Snapshot, now: &Snapshot) -> bool {
    bound == now
}

pub const VERIFY_SCHEMA: u32 = 2;

/// Data, never an exit code: whether it blocks a merge is the operator's policy.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifyResult {
    pub schema: u32,
    pub snapshot: Snapshot,
    pub lines: Vec<LineEntry>,
    pub symbols: Vec<SymbolEntry>,
    pub degradations: Vec<Degradation>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ViolationKind {
    Missing,
    Duplicate,
    Unchanged,
    UnlistedDegradation,
    UnknownSymbol,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BucketViolation {
    pub kind: ViolationKind,
    pub file: String,
    pub line: u32,
}

/// Empty exactly when every changed line sits in one bucket and every reference resolves.
pub fn check_buckets(changed: &ChangedLines, result: &VerifyResult) -> Vec<BucketViolation> {
    let mut violations = Vec::new();
    let mut flag = |kind, file: &str, line| {
        violations.push(BucketViolation {
            kind,
            file: file.to_string(),
            line,
        })
    };
    let symbols: BTreeSet<&str> = result.symbols.iter().map(|s| s.id.as_str()).collect();
    let mut seen: BTreeSet<(&str, u32)> = BTreeSet::new();

    for entry in &result.lines {
        let (file, line) = (entry.file.as_str(), entry.line);
        if !seen.insert((file, line)) {
            flag(ViolationKind::Duplicate, file, line);
        }
        if !changed.get(file).is_some_and(|ls| ls.contains(&line)) {
            flag(ViolationKind::Unchanged, file, line);
        }
        if let Sorted::Unknown { degradation } = entry.sort
            && degradation >= result.degradations.len()
        {
            flag(ViolationKind::UnlistedDegradation, file, line);
        }
        if entry
            .symbol
            .as_deref()
            .is_some_and(|s| !symbols.contains(s))
        {
            flag(ViolationKind::UnknownSymbol, file, line);
        }
    }

    for (file, lines) in changed {
        for &line in lines {
            if !seen.contains(&(file.as_str(), line)) {
                flag(ViolationKind::Missing, file, line);
            }
        }
    }
    violations
}

pub fn count_buckets(lines: &[LineEntry]) -> BTreeMap<Bucket, usize> {
    let mut counts: BTreeMap<Bucket, usize> = BUCKETS.iter().map(|&b| (b, 0)).collect();
    for entry in lines {
        *counts.entry(entry.sort.bucket()).or_default() += 1;
    }
    counts
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use serde_json::json;

    fn entry(file: &str, line: u32, sort: Sorted) -> LineEntry {
        LineEntry {
            file: file.into(),
            line,
            symbol: None,
            sort,
        }
    }

    fn covered() -> Sorted {
        Sorted::Covered {
            producer: "bun".into(),
        }
    }

    fn result(lines: Vec<LineEntry>, degradations: Vec<Degradation>) -> VerifyResult {
        VerifyResult {
            schema: VERIFY_SCHEMA,
            snapshot: snapshot("c1", None),
            lines,
            symbols: vec![],
            degradations,
        }
    }

    fn snapshot(commit: &str, uncommitted: Option<&str>) -> Snapshot {
        Snapshot {
            commit: commit.into(),
            base: "b0".into(),
            uncommitted: uncommitted.map(Into::into),
        }
    }

    fn changed(entries: &[(&str, &[u32])]) -> ChangedLines {
        entries
            .iter()
            .map(|(f, ls)| (f.to_string(), ls.iter().copied().collect()))
            .collect()
    }

    fn kinds(v: &[BucketViolation]) -> Vec<(ViolationKind, &str, u32)> {
        v.iter()
            .map(|x| (x.kind, x.file.as_str(), x.line))
            .collect()
    }

    #[test]
    fn line_entry_json_matches_the_typescript_engine() {
        let raw = json!([
            {"file": "a.ts", "line": 3, "symbol": "a.ts::f", "bucket": "covered", "producer": "bun"},
            {"file": "a.ts", "line": 4, "symbol": null, "bucket": "unknown", "degradation": 0},
            {"file": "a.ts", "line": 5, "symbol": null, "bucket": "excluded", "reason": "non-executable"}
        ]);
        let lines: Vec<LineEntry> = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(lines[1].sort, Sorted::Unknown { degradation: 0 });
        assert_eq!(
            lines[2].sort,
            Sorted::Excluded {
                reason: Exclusion::NonExecutable
            }
        );
        assert_eq!(serde_json::to_value(&lines).unwrap(), raw);
    }

    #[test]
    fn degradation_and_symbol_json_match_the_typescript_engine() {
        let raw = json!({"kind": "source-unknown", "source": "tree-sitter", "lookup": "outline", "reason": "not available"});
        let d: Degradation = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(serde_json::to_value(&d).unwrap(), raw);
        let raw = json!({"id": "a.ts::f", "file": "a.ts", "name": "f", "kind": "function",
            "startLine": 1, "endLine": 9, "change": "body", "source": "infigraph",
            "certainty": "likely", "tier": "low", "rule": "entry-glue"});
        let s: SymbolEntry = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(serde_json::to_value(&s).unwrap(), raw);
    }

    #[test]
    fn tier_out_of_scope_wins_over_trivial() {
        assert_eq!(
            tier_of(Some(LowRule::Data), false),
            (Tier::Low, Some(LowRule::OutOfScope))
        );
        assert_eq!(
            tier_of(Some(LowRule::Small), true),
            (Tier::Low, Some(LowRule::Small))
        );
        assert_eq!(tier_of(None, true), (Tier::Attention, None));
    }

    #[test]
    fn result_is_bound_to_its_snapshot() {
        let bound = snapshot("c1", None);
        assert!(is_current(&bound, &snapshot("c1", None)));
        assert!(!is_current(&bound, &snapshot("c2", None)));
        assert!(!is_current(&bound, &snapshot("c1", Some("h"))));
        let mut moved = snapshot("c1", None);
        moved.base = "b1".into();
        assert!(!is_current(&bound, &moved));
    }

    #[test]
    fn check_buckets_flags_missing_duplicate_and_unchanged() {
        let c = changed(&[("a.ts", &[1, 2])]);
        let r = result(
            vec![
                entry("a.ts", 1, covered()),
                entry("a.ts", 1, covered()),
                entry("a.ts", 7, covered()),
            ],
            vec![],
        );
        assert_eq!(
            kinds(&check_buckets(&c, &r)),
            vec![
                (ViolationKind::Duplicate, "a.ts", 1),
                (ViolationKind::Unchanged, "a.ts", 7),
                (ViolationKind::Missing, "a.ts", 2),
            ]
        );
    }

    #[test]
    fn check_buckets_flags_dangling_references() {
        let c = changed(&[("a.ts", &[1, 2])]);
        let mut with_symbol = entry("a.ts", 2, covered());
        with_symbol.symbol = Some("a.ts::gone".into());
        let r = result(
            vec![
                entry("a.ts", 1, Sorted::Unknown { degradation: 0 }),
                with_symbol,
            ],
            vec![],
        );
        assert_eq!(
            kinds(&check_buckets(&c, &r)),
            vec![
                (ViolationKind::UnlistedDegradation, "a.ts", 1),
                (ViolationKind::UnknownSymbol, "a.ts", 2),
            ]
        );
    }

    #[test]
    fn count_buckets_lists_every_bucket() {
        let counts = count_buckets(&[entry("a.ts", 1, covered())]);
        assert_eq!(counts.len(), 4);
        assert_eq!(counts[&Bucket::Covered], 1);
        assert_eq!(counts[&Bucket::Unknown], 0);
    }

    fn any_sort() -> impl Strategy<Value = Sorted> {
        prop_oneof![
            Just(covered()),
            Just(Sorted::Uncovered {
                producer: "bun".into()
            }),
            Just(Sorted::Unknown { degradation: 0 }),
            Just(Sorted::Excluded {
                reason: Exclusion::Test
            }),
        ]
    }

    fn any_changed() -> impl Strategy<Value = ChangedLines> {
        prop::collection::btree_map(
            "[a-c]\\.ts",
            prop::collection::btree_set(1u32..40, 0..12),
            0..4,
        )
    }

    fn no_coverage() -> Degradation {
        Degradation::NoCoverage {
            language: "go".into(),
            reason: "no profile".into(),
        }
    }

    proptest! {
        // A failing seed file would land in the source tree: tests write no tracked files.
        #![proptest_config(ProptestConfig {
            failure_persistence: None,
            ..ProptestConfig::default()
        })]

        // The pass mark: buckets add up to the changed lines whenever the sheet is valid.
        #[test]
        fn buckets_add_up_to_changed_lines(
            c in any_changed(),
            sorts in prop::collection::vec(any_sort(), 0..60),
        ) {
            let mut sorts = sorts.into_iter().cycle();
            let lines: Vec<_> = c
                .iter()
                .flat_map(|(f, ls)| ls.iter().map(move |l| (f.clone(), *l)))
                .map(|(f, l)| entry(&f, l, sorts.next().unwrap_or_else(covered)))
                .collect();
            let r = result(lines, vec![no_coverage()]);
            let total: usize = c.values().map(BTreeSet::len).sum();
            prop_assert!(check_buckets(&c, &r).is_empty());
            prop_assert_eq!(count_buckets(&r.lines).values().sum::<usize>(), total);
        }

        // Any sheet, valid or not: no violations implies the sum matches.
        #[test]
        fn valid_sheet_never_miscounts(
            c in any_changed(),
            picks in prop::collection::vec(("[a-c]\\.ts", 1u32..40, any_sort()), 0..40),
        ) {
            let lines = picks.into_iter().map(|(f, l, s)| entry(&f, l, s)).collect();
            let r = result(lines, vec![no_coverage()]);
            let total: usize = c.values().map(BTreeSet::len).sum();
            if check_buckets(&c, &r).is_empty() {
                prop_assert_eq!(count_buckets(&r.lines).values().sum::<usize>(), total);
            }
        }
    }
}

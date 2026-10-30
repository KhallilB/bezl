//! Secrets come out of captured text before an event is written; the record never holds one.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// One secret taken out of an event: the rule that found it and its short hash.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Redaction {
    pub rule: String,
    pub hash: String,
}

/// Exact values to redact, each named by its rule.
#[derive(Clone, Debug, Default)]
pub struct Secrets {
    known: Vec<(String, String)>,
}

impl Secrets {
    /// Values of the environment variables Bezl passes to workers. Empty values are skipped.
    pub fn from_env(vars: impl IntoIterator<Item = (String, String)>) -> Self {
        let mut known: Vec<(String, String)> = vars
            .into_iter()
            .filter(|(_, value)| !value.is_empty())
            .map(|(name, value)| (format!("env:{name}"), value))
            .collect();
        // Longest first, so a secret inside another never splits it.
        known.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.cmp(b)));
        Secrets { known }
    }

    /// The text with each secret replaced by its token, and each secret found, once.
    pub fn redact(&self, text: &str) -> (String, Vec<Redaction>) {
        let mut out = String::with_capacity(text.len());
        let mut found: Vec<Redaction> = Vec::new();
        let mut rest = text;
        // One left-to-right pass: a token written here is never scanned again.
        while let Some(c) = rest.chars().next() {
            match self
                .known
                .iter()
                .find(|(_, v)| rest.starts_with(v.as_str()))
            {
                Some((rule, value)) => {
                    let hash = short_hash(value);
                    out.push_str(&token(&hash));
                    let r = Redaction {
                        rule: rule.clone(),
                        hash,
                    };
                    if !found.contains(&r) {
                        found.push(r);
                    }
                    rest = &rest[value.len()..];
                }
                None => {
                    out.push(c);
                    rest = &rest[c.len_utf8()..];
                }
            }
        }
        (out, found)
    }
}

/// Tells secrets apart without storing them.
pub fn short_hash(secret: &str) -> String {
    let digest = Sha256::digest(secret.as_bytes());
    digest[..6].iter().map(|b| format!("{b:02x}")).collect()
}

pub fn token(hash: &str) -> String {
    format!("[secret:{hash}]")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secrets(vars: &[(&str, &str)]) -> Secrets {
        Secrets::from_env(vars.iter().map(|(k, v)| (k.to_string(), v.to_string())))
    }

    fn found(rule: &str, secret: &str) -> Redaction {
        Redaction {
            rule: rule.into(),
            hash: short_hash(secret),
        }
    }

    #[test]
    fn env_value_becomes_its_hash_token_and_is_recorded_once() {
        let s = secrets(&[("API_KEY", "sk-live-123456")]);
        let (text, redactions) = s.redact("a sk-live-123456 b sk-live-123456");
        let t = token(&short_hash("sk-live-123456"));
        assert_eq!(text, format!("a {t} b {t}"));
        assert_eq!(redactions, vec![found("env:API_KEY", "sk-live-123456")]);
    }

    #[test]
    fn short_hash_is_short_stable_and_tells_secrets_apart() {
        let h = short_hash("sk-live-123456");
        assert_eq!(h.len(), 12);
        assert!(h.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_eq!(h, short_hash("sk-live-123456"));
        assert_ne!(h, short_hash("sk-live-654321"));
        assert!(!h.contains("sk-live"));
    }

    #[test]
    fn longest_secret_wins_where_one_contains_another() {
        let s = secrets(&[("SHORT", "abc123"), ("LONG", "abc123xyz789")]);
        let (text, redactions) = s.redact("abc123xyz789 abc123");
        assert_eq!(
            text,
            format!(
                "{} {}",
                token(&short_hash("abc123xyz789")),
                token(&short_hash("abc123"))
            )
        );
        assert_eq!(
            redactions,
            vec![
                found("env:LONG", "abc123xyz789"),
                found("env:SHORT", "abc123")
            ]
        );
    }

    #[test]
    fn a_token_is_never_redacted_again() {
        let s = secrets(&[("A", "secret-value"), ("B", "secret")]);
        let (text, _) = s.redact("secret-value");
        assert_eq!(text, token(&short_hash("secret-value")));
    }

    #[test]
    fn empty_values_and_clean_text_redact_nothing() {
        let s = secrets(&[("EMPTY", "")]);
        assert_eq!(s.redact("plain text"), ("plain text".into(), vec![]));
        assert_eq!(Secrets::default().redact("x"), ("x".into(), vec![]));
    }

    #[test]
    fn redaction_json_names_rule_and_hash() {
        let r = Redaction {
            rule: "env:API_KEY".into(),
            hash: "0123456789ab".into(),
        };
        assert_eq!(
            serde_json::to_value(&r).unwrap(),
            serde_json::json!({"rule": "env:API_KEY", "hash": "0123456789ab"})
        );
    }
}

//! Text captured from an agent or terminal. Kept raw; flagged spans are masked on export.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Captured {
    pub text: String,
    /// Empty until a scanner exists; flags never change `text`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub redactions: Vec<Redaction>,
}

/// Byte span of `text` and the rule that flagged it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Redaction {
    pub start: usize,
    pub end: usize,
    pub rule: String,
}

pub const MASK: &str = "[redacted]";

impl Captured {
    pub fn new(text: impl Into<String>) -> Self {
        Captured {
            text: text.into(),
            redactions: Vec::new(),
        }
    }

    /// The text for export or a screen. Bad spans mask more, never less.
    pub fn masked(&self) -> String {
        let text = &self.text;
        let mut spans: Vec<(usize, usize)> = self
            .redactions
            .iter()
            .map(|r| (floor_char(text, r.start), ceil_char(text, r.end)))
            .filter(|(start, end)| start < end)
            .collect();
        spans.sort_unstable();
        let mut merged: Vec<(usize, usize)> = Vec::new();
        for (start, end) in spans {
            match merged.last_mut() {
                Some(last) if start <= last.1 => last.1 = last.1.max(end),
                _ => merged.push((start, end)),
            }
        }

        let mut out = String::with_capacity(text.len());
        let mut at = 0;
        for (start, end) in merged {
            out.push_str(&text[at..start]);
            out.push_str(MASK);
            at = end;
        }
        out.push_str(&text[at..]);
        out
    }
}

fn floor_char(text: &str, i: usize) -> usize {
    let mut i = i.min(text.len());
    while !text.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn ceil_char(text: &str, i: usize) -> usize {
    let mut i = i.min(text.len());
    while !text.is_char_boundary(i) {
        i += 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flagged(text: &str, spans: &[(usize, usize)]) -> Captured {
        Captured {
            text: text.into(),
            redactions: spans
                .iter()
                .map(|&(start, end)| Redaction {
                    start,
                    end,
                    rule: "token".into(),
                })
                .collect(),
        }
    }

    #[test]
    fn unflagged_text_is_unchanged_and_omits_redactions_in_json() {
        let c = Captured::new("hello");
        assert_eq!(c.masked(), "hello");
        assert_eq!(serde_json::to_string(&c).unwrap(), r#"{"text":"hello"}"#);
        let back: Captured = serde_json::from_str(r#"{"text":"hello"}"#).unwrap();
        assert_eq!(back, c);
    }

    #[test]
    fn flagged_span_is_masked_and_raw_text_kept() {
        let c = flagged("key=sk-123 ok", &[(4, 10)]);
        assert_eq!(c.masked(), "key=[redacted] ok");
        assert_eq!(c.text, "key=sk-123 ok");
    }

    #[test]
    fn overlapping_spans_mask_once() {
        let c = flagged("aaSECRETbb", &[(2, 6), (4, 8)]);
        assert_eq!(c.masked(), "aa[redacted]bb");
    }

    #[test]
    fn span_past_the_end_masks_to_the_end() {
        let c = flagged("ab secret", &[(3, 99)]);
        assert_eq!(c.masked(), "ab [redacted]");
    }

    #[test]
    fn span_inside_a_character_widens_to_cover_it() {
        // "é" is bytes 1..3; a span starting at 2 must still hide all of it.
        let c = flagged("xéy", &[(2, 3)]);
        assert_eq!(c.masked(), "x[redacted]y");
    }
}

//! Text from an agent, a CLI or a terminal. Redacted before it reaches the record.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Captured {
    pub text: String,
}

impl Captured {
    pub fn new(text: impl Into<String>) -> Self {
        Captured { text: text.into() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captured_json_is_its_text() {
        let c = Captured::new("hello");
        assert_eq!(serde_json::to_string(&c).unwrap(), r#"{"text":"hello"}"#);
        assert_eq!(
            serde_json::from_str::<Captured>(r#"{"text":"hello"}"#).unwrap(),
            c
        );
    }
}

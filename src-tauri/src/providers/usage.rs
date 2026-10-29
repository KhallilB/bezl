//! What each agent CLI reports about tokens spent and usage limits; never guessed.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Usage {
    pub tokens: Tokens,
    pub limits: Limits,
}

impl Usage {
    pub const UNKNOWN: Usage = Usage {
        tokens: Tokens::Unknown,
        limits: Limits::Unknown,
    };
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum Tokens {
    Unknown,
    Known {
        total: Counts,
        models: Vec<ModelCounts>,
    },
}

/// Raw counts as reported: Codex counts cached input inside `input`, Claude Code does not.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelCounts {
    pub model: String,
    pub counts: Counts,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum Limits {
    Unknown,
    /// `hit` is the CLI's own words when it refused for a limit.
    Reported {
        windows: Vec<Window>,
        hit: Option<String>,
    },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    /// The CLI's name: Claude's `five_hour`, Codex's `primary`.
    pub name: String,
    pub minutes: Option<u64>,
    pub used_percent: Option<u32>,
    /// Unix seconds.
    pub resets_at: Option<u64>,
    pub reached: Option<bool>,
}

/// Claude Code's `json` result, or `stream-json` events, one per line.
pub fn claude_usage(stdout: &str) -> Usage {
    let mut usage = Usage::UNKNOWN;
    for event in events(stdout) {
        match event["type"].as_str() {
            Some("result") => {
                usage.tokens = claude_tokens(&event);
                if event["api_error_status"] == 429 {
                    usage.limits.hit(event["result"].as_str().unwrap_or("429"));
                }
            }
            Some("rate_limit_event") => {
                let info = &event["rate_limit_info"];
                let windows = match info["unifiedWindows"].as_object() {
                    Some(windows) => windows
                        .iter()
                        .map(|(name, w)| claude_window(name, w))
                        .collect(),
                    None => match info["rateLimitType"].as_str() {
                        Some(name) => vec![claude_window(name, info)],
                        None => continue,
                    },
                };
                usage.limits.windows(windows);
            }
            _ => {}
        }
    }
    usage
}

/// Codex `exec --json` events, or rollout lines that wrap `token_count` in `event_msg`.
pub fn codex_usage(stdout: &str) -> Usage {
    let mut usage = Usage::UNKNOWN;
    for event in events(stdout) {
        let event = match event["type"].as_str() {
            Some("event_msg") => &event["payload"],
            _ => &event,
        };
        match event["type"].as_str() {
            // On resume this is the thread's running total.
            Some("turn.completed") => usage.tokens = codex_tokens(&event["usage"]),
            Some("token_count") => {
                let total = &event["info"]["total_token_usage"];
                if !total.is_null() {
                    usage.tokens = codex_tokens(total);
                }
                let limits = &event["rate_limits"];
                if limits.is_object() {
                    let windows = ["primary", "secondary"]
                        .into_iter()
                        .filter(|name| limits[name].is_object())
                        .map(|name| codex_window(name, &limits[name]))
                        .collect();
                    usage.limits.windows(windows);
                    if let Some(reached) = limits["rate_limit_reached_type"].as_str() {
                        usage.limits.hit(reached);
                    }
                }
            }
            _ => {}
        }
    }
    usage
}

impl Limits {
    fn windows(&mut self, windows: Vec<Window>) {
        match self {
            Limits::Reported { windows: w, .. } => *w = windows,
            Limits::Unknown => *self = Limits::Reported { windows, hit: None },
        }
    }

    fn hit(&mut self, says: &str) {
        match self {
            Limits::Reported { hit, .. } => *hit = Some(says.into()),
            Limits::Unknown => {
                *self = Limits::Reported {
                    windows: vec![],
                    hit: Some(says.into()),
                }
            }
        }
    }
}

/// JSON values until the first that does not parse: one document or JSON lines.
pub(crate) fn events(stdout: &str) -> impl Iterator<Item = Value> + '_ {
    serde_json::Deserializer::from_str(stdout)
        .into_iter::<Value>()
        .map_while(Result::ok)
}

/// Any count missing means unknown, never zero.
fn counts(v: &Value, [input, output, cache_read, cache_write]: [&str; 4]) -> Option<Counts> {
    Some(Counts {
        input: v[input].as_u64()?,
        output: v[output].as_u64()?,
        cache_read: v[cache_read].as_u64()?,
        cache_write: v[cache_write].as_u64()?,
    })
}

fn claude_tokens(result: &Value) -> Tokens {
    const TOTAL: [&str; 4] = [
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
    ];
    const MODEL: [&str; 4] = [
        "inputTokens",
        "outputTokens",
        "cacheReadInputTokens",
        "cacheCreationInputTokens",
    ];
    let Some(total) = counts(&result["usage"], TOTAL) else {
        return Tokens::Unknown;
    };
    let models = result["modelUsage"]
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(model, v)| {
            Some(ModelCounts {
                model: model.clone(),
                counts: counts(v, MODEL)?,
            })
        })
        .collect();
    Tokens::Known { total, models }
}

/// Codex reports no per-model split.
fn codex_tokens(usage: &Value) -> Tokens {
    const TOTAL: [&str; 4] = [
        "input_tokens",
        "output_tokens",
        "cached_input_tokens",
        "cache_write_input_tokens",
    ];
    match counts(usage, TOTAL) {
        Some(total) => Tokens::Known {
            total,
            models: vec![],
        },
        None => Tokens::Unknown,
    }
}

/// Claude reports a fraction, Codex a percent.
fn percent(used: Option<f64>, scale: f64) -> Option<u32> {
    used.map(|v| (v * scale).round() as u32)
}

fn claude_window(name: &str, w: &Value) -> Window {
    Window {
        name: name.into(),
        minutes: None,
        used_percent: percent(w["utilization"].as_f64(), 100.0),
        resets_at: w["resetsAt"].as_u64(),
        reached: w["status"].as_str().map(|s| s == "rejected"),
    }
}

fn codex_window(name: &str, w: &Value) -> Window {
    Window {
        name: name.into(),
        minutes: w["window_minutes"].as_u64(),
        used_percent: percent(w["used_percent"].as_f64(), 1.0),
        resets_at: w["resets_at"].as_u64(),
        reached: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const CANARY: &str = include_str!("fixtures/claude-2.1.312/signed-in.json");
    const NOT_LOGGED_IN: &str = include_str!("fixtures/claude-2.1.312/not-logged-in.json");
    const OUT_OF_QUOTA: &str =
        include_str!("fixtures/claude-2.1.312/out-of-quota-synthesized.json");
    const STREAM: &str = include_str!("fixtures/claude-2.1.312/stream-rate-limit-and-result.jsonl");
    const EXEC: &str = include_str!("fixtures/codex-0.163.0/exec-ok.jsonl");
    // Captured from the rollout of the `exec` run above; `plan_type` redacted.
    const ROLLOUT: &str = include_str!("fixtures/codex-0.163.0/rollout-token-count.jsonl");

    fn counts(input: u64, output: u64, cache_read: u64, cache_write: u64) -> Counts {
        Counts {
            input,
            output,
            cache_read,
            cache_write,
        }
    }

    fn haiku(counts: Counts) -> Vec<ModelCounts> {
        vec![ModelCounts {
            model: "claude-haiku-5-5".into(),
            counts,
        }]
    }

    #[test]
    fn the_claude_canary_reports_its_tokens_but_not_its_limits() {
        assert_eq!(
            claude_usage(CANARY),
            Usage {
                tokens: Tokens::Known {
                    total: counts(2, 4, 0, 29763),
                    models: haiku(counts(2, 4, 0, 29763)),
                },
                limits: Limits::Unknown,
            }
        );
    }

    #[test]
    fn claude_stream_json_reports_each_limit_window() {
        let usage = claude_usage(STREAM);
        assert_eq!(
            usage.limits,
            Limits::Reported {
                windows: vec![
                    Window {
                        name: "five_hour".into(),
                        minutes: None,
                        used_percent: Some(43),
                        resets_at: Some(1793299200),
                        reached: Some(false),
                    },
                    Window {
                        name: "seven_day".into(),
                        minutes: None,
                        used_percent: Some(52),
                        resets_at: Some(1793343600),
                        reached: Some(false),
                    },
                ],
                hit: None,
            }
        );
        assert_eq!(
            usage.tokens,
            Tokens::Known {
                total: counts(2, 4, 0, 105502),
                models: haiku(counts(2, 4, 0, 105502)),
            }
        );
    }

    #[test]
    fn a_rejected_claude_window_is_reached() {
        let rejected = STREAM.replacen(
            r#""seven_day":{"utilization":0.52,"resetsAt":1793343600,"status":"allowed"}"#,
            r#""seven_day":{"utilization":1.0,"resetsAt":1793343600,"status":"rejected"}"#,
            1,
        );
        let Limits::Reported { windows, .. } = claude_usage(&rejected).limits else {
            panic!("limits unknown");
        };
        assert_eq!(
            windows
                .iter()
                .map(|w| (w.used_percent, w.reached))
                .collect::<Vec<_>>(),
            [(Some(43), Some(false)), (Some(100), Some(true))]
        );
    }

    #[test]
    fn a_claude_429_is_a_limit_hit_in_its_own_words() {
        assert_eq!(
            claude_usage(OUT_OF_QUOTA),
            Usage {
                tokens: Tokens::Known {
                    total: counts(0, 0, 0, 0),
                    models: vec![],
                },
                limits: Limits::Reported {
                    windows: vec![],
                    hit: Some("You've hit your limit · resets 5pm".into()),
                },
            }
        );
    }

    #[test]
    fn signed_out_claude_reports_zero_tokens_and_no_limits() {
        assert_eq!(
            claude_usage(NOT_LOGGED_IN),
            Usage {
                tokens: Tokens::Known {
                    total: counts(0, 0, 0, 0),
                    models: vec![],
                },
                limits: Limits::Unknown,
            }
        );
    }

    #[test]
    fn claude_output_without_usage_is_unknown() {
        for stdout in [
            "",
            "error: unknown option '--tools'\n",
            r#"{"type":"result","is_error":false,"result":"OK"}"#,
            r#"{"type":"result","usage":{"input_tokens":2}}"#,
        ] {
            assert_eq!(claude_usage(stdout), Usage::UNKNOWN, "{stdout:?}");
        }
    }

    #[test]
    fn codex_exec_reports_tokens_but_not_limits() {
        assert_eq!(
            codex_usage(EXEC),
            Usage {
                tokens: Tokens::Known {
                    total: counts(26076, 5, 13184, 0),
                    models: vec![],
                },
                limits: Limits::Unknown,
            }
        );
    }

    #[test]
    fn a_codex_token_count_reports_its_rate_limit_windows() {
        assert_eq!(
            codex_usage(ROLLOUT),
            Usage {
                tokens: Tokens::Known {
                    total: counts(26076, 5, 13184, 0),
                    models: vec![],
                },
                limits: Limits::Reported {
                    windows: vec![Window {
                        name: "primary".into(),
                        minutes: Some(10080),
                        used_percent: Some(65),
                        resets_at: Some(1793775956),
                        reached: None,
                    }],
                    hit: None,
                },
            }
        );
    }

    #[test]
    fn a_reached_codex_rate_limit_is_a_hit_in_its_own_words() {
        let reached = ROLLOUT.replace(
            r#""rate_limit_reached_type":null"#,
            r#""rate_limit_reached_type":"rate_limit_reached""#,
        );
        let Limits::Reported { hit, .. } = codex_usage(&reached).limits else {
            panic!("limits unknown");
        };
        assert_eq!(hit.as_deref(), Some("rate_limit_reached"));
    }

    #[test]
    fn codex_output_without_usage_is_unknown() {
        for stdout in [
            "",
            "Logged in using ChatGPT\n",
            r#"{"type":"thread.started","thread_id":"t"}"#,
            r#"{"type":"turn.completed","usage":{"input_tokens":1}}"#,
        ] {
            assert_eq!(codex_usage(stdout), Usage::UNKNOWN, "{stdout:?}");
        }
    }

    #[test]
    fn usage_serializes_for_the_screen() {
        let usage = Usage {
            tokens: Tokens::Known {
                total: counts(2, 4, 0, 9),
                models: haiku(counts(2, 4, 0, 9)),
            },
            limits: Limits::Reported {
                windows: vec![Window {
                    name: "primary".into(),
                    minutes: Some(300),
                    used_percent: Some(5),
                    resets_at: None,
                    reached: None,
                }],
                hit: Some("limit".into()),
            },
        };
        let c = json!({ "input": 2, "output": 4, "cacheRead": 0, "cacheWrite": 9 });
        assert_eq!(
            serde_json::to_value(&usage).unwrap(),
            json!({
                "tokens": {
                    "kind": "known",
                    "detail": { "total": c, "models": [{ "model": "claude-haiku-5-5", "counts": c }] }
                },
                "limits": {
                    "kind": "reported",
                    "detail": {
                        "windows": [{
                            "name": "primary", "minutes": 300, "usedPercent": 5,
                            "resetsAt": null, "reached": null
                        }],
                        "hit": "limit"
                    }
                }
            })
        );
        assert_eq!(
            serde_json::to_value(Usage::UNKNOWN).unwrap(),
            json!({ "tokens": { "kind": "unknown" }, "limits": { "kind": "unknown" } })
        );
    }
}

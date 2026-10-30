//! Scripted milestone demos in the real app, debug builds only: `scripts/demo/run.sh` sets the env.
pub mod snapshot;

use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

pub const SCENARIOS: [&str; 2] = ["providers", "terminals"];

#[derive(Debug, PartialEq, Serialize)]
pub struct Demo {
    pub scenario: String,
    pub out: PathBuf,
}

/// `BEZL_DEMO` is the out folder, `BEZL_DEMO_SCENARIO` one of `SCENARIOS`.
pub fn plan(out: Option<OsString>, scenario: Option<String>) -> Result<Option<Demo>, String> {
    let Some(out) = out else { return Ok(None) };
    match scenario {
        Some(s) if SCENARIOS.contains(&s.as_str()) => Ok(Some(Demo {
            scenario: s,
            out: out.into(),
        })),
        s => Err(format!(
            "BEZL_DEMO_SCENARIO {s:?} is not one of {}",
            SCENARIOS.join(", ")
        )),
    }
}

/// Frames sort in the order they were taken: `01-streaming.png`.
pub fn frame_file(n: usize, name: &str) -> String {
    let slug = name
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    format!("{n:02}-{slug}.png")
}

fn from_env() -> Result<Option<Demo>, String> {
    plan(
        std::env::var_os("BEZL_DEMO"),
        std::env::var("BEZL_DEMO_SCENARIO").ok(),
    )
}

fn demo() -> Result<Demo, String> {
    from_env()?.ok_or_else(|| "no demo".into())
}

/// Runs at app setup; a no-op without a demo.
pub fn setup(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if from_env()?.is_none() {
        return Ok(());
    }
    let window = app.get_webview_window("main").ok_or("no main window")?;
    snapshot::keep_rendering(&window)
}

#[tauri::command]
pub fn demo_plan() -> Result<Option<Demo>, String> {
    from_env()
}

/// A step of the script, to `app.log`.
#[tauri::command]
pub fn demo_log(line: String) {
    eprintln!("demo: {line}");
}

static FRAMES: AtomicUsize = AtomicUsize::new(0);

/// CSS pixels in the page's viewport.
#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Saves the next numbered frame, cropped to `rect` when given; returns its path.
#[tauri::command]
pub async fn demo_snap(
    window: tauri::WebviewWindow,
    name: String,
    rect: Option<Rect>,
) -> Result<PathBuf, String> {
    let out = demo()?.out;
    // Snapshot blocks on a reply from the main thread.
    let png = tauri::async_runtime::spawn_blocking(move || snapshot::png(&window, rect))
        .await
        .map_err(|e| e.to_string())??;
    let n = FRAMES.fetch_add(1, Ordering::SeqCst) + 1;
    let path = out.join(frame_file(n, &name));
    std::fs::write(&path, png).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(path)
}

/// Writes `result.json`, then quits so the script can read it.
#[tauri::command]
pub fn demo_done(result: String) -> Result<(), String> {
    std::fs::write(demo()?.out.join("result.json"), result).map_err(|e| e.to_string())?;
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_out_folder_is_no_demo() {
        assert_eq!(plan(None, Some("providers".into())), Ok(None));
    }

    #[test]
    fn a_known_scenario_runs_into_its_folder() {
        assert_eq!(
            plan(Some("/tmp/d".into()), Some("terminals".into())),
            Ok(Some(Demo {
                scenario: "terminals".into(),
                out: "/tmp/d".into()
            }))
        );
    }

    #[test]
    fn an_unknown_or_missing_scenario_is_refused() {
        assert!(plan(Some("/tmp/d".into()), Some("nope".into())).is_err());
        assert!(plan(Some("/tmp/d".into()), None).is_err());
    }

    #[test]
    fn frames_are_numbered_and_named_for_files() {
        assert_eq!(frame_file(1, "streaming"), "01-streaming.png");
        assert_eq!(
            frame_file(12, "Codex card / rejected"),
            "12-codex-card-rejected.png"
        );
    }
}

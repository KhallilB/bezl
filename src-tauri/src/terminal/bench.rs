//! M4's pass-mark bench, debug builds only: `scripts/terminal-bench/run.sh` sets the env.
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct Bench {
    payload: PathBuf,
    result: PathBuf,
}

/// `BEZL_TERMINAL_BENCH` names a folder holding `payload.txt`; the report goes beside it.
#[tauri::command]
pub fn terminal_bench() -> Option<Bench> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let dir = PathBuf::from(std::env::var_os("BEZL_TERMINAL_BENCH")?);
    Some(Bench {
        payload: dir.join("payload.txt"),
        result: dir.join("result.json"),
    })
}

/// Writes the report, then quits so the script can read it.
#[tauri::command]
pub fn terminal_bench_done(report: String) -> Result<(), String> {
    let bench = terminal_bench().ok_or("no bench")?;
    std::fs::write(&bench.result, report).map_err(|e| e.to_string())?;
    std::process::exit(0);
}

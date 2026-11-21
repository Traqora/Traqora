//! CLI wrapper around the `gas-snapshot` library.
//!
//! Usage:
//!   gas-snapshot capture <wasm-dir> <out.json> --release <tag> [--timestamp <iso>]
//!   gas-snapshot compare <current.json> <baseline.json> [--threshold <pct>]
//!
//! `compare` exits non-zero when any contract regresses beyond `--threshold`
//! (default 5%), so it can gate a release in CI.

use gas_snapshot::{capture, compare, read_snapshot, write_snapshot, Change};
use std::path::Path;
use std::process::ExitCode;

const DEFAULT_THRESHOLD: f64 = 5.0;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(code) => code,
        Err(message) => {
            eprintln!("error: {message}");
            ExitCode::from(2)
        }
    }
}

fn run(args: &[String]) -> Result<ExitCode, String> {
    let command = args.first().map(String::as_str).unwrap_or("");
    match command {
        "capture" => run_capture(&args[1..]),
        "compare" => run_compare(&args[1..]),
        "help" | "--help" | "-h" | "" => {
            print_usage();
            Ok(ExitCode::SUCCESS)
        }
        other => Err(format!("unknown command: {other}")),
    }
}

fn run_capture(args: &[String]) -> Result<ExitCode, String> {
    let positional: Vec<&str> = args
        .iter()
        .take_while(|a| !a.starts_with("--"))
        .map(String::as_str)
        .collect();
    if positional.len() < 2 {
        return Err("capture requires <wasm-dir> <out.json>".to_string());
    }
    let wasm_dir = Path::new(positional[0]);
    let out = Path::new(positional[1]);
    let release = flag(args, "--release").unwrap_or_else(|| "unreleased".to_string());
    let timestamp = flag(args, "--timestamp").unwrap_or_else(|| "unknown".to_string());

    let snapshot = capture(wasm_dir, &release, &timestamp).map_err(|e| e.to_string())?;
    write_snapshot(out, &snapshot).map_err(|e| e.to_string())?;

    println!(
        "=== Gas snapshot captured ({} contracts) ===",
        snapshot.contracts.len()
    );
    println!("release: {}", snapshot.release);
    println!("output:  {}", out.display());
    for (name, size) in &snapshot.contracts {
        println!("  {name}: {size} bytes");
    }
    Ok(ExitCode::SUCCESS)
}

fn run_compare(args: &[String]) -> Result<ExitCode, String> {
    let positional: Vec<&str> = args
        .iter()
        .take_while(|a| !a.starts_with("--"))
        .map(String::as_str)
        .collect();
    if positional.len() < 2 {
        return Err("compare requires <current.json> <baseline.json>".to_string());
    }
    let current = read_snapshot(Path::new(positional[0])).map_err(|e| e.to_string())?;
    let baseline = read_snapshot(Path::new(positional[1])).map_err(|e| e.to_string())?;
    let threshold = match flag(args, "--threshold") {
        Some(v) => v
            .parse::<f64>()
            .map_err(|_| format!("threshold is not a number: {v}"))?,
        None => DEFAULT_THRESHOLD,
    };

    let comparison = compare(&baseline, &current, threshold).map_err(|e| e.to_string())?;

    println!("=== Gas snapshot comparison ===");
    println!("baseline release: {}", baseline.release);
    println!("current release:  {}", current.release);
    println!("threshold:        {threshold}%");
    println!();
    for (name, change) in &comparison.changes {
        println!("  {name}: {}", describe(change));
    }

    if comparison.has_regression() {
        println!();
        println!(
            "REGRESSION: {} contract(s) exceeded threshold: {}",
            comparison.regressions().len(),
            comparison.regressions().join(", ")
        );
        return Ok(ExitCode::FAILURE);
    }
    println!();
    println!("OK: no gas regressions beyond {threshold}%");
    Ok(ExitCode::SUCCESS)
}

fn describe(change: &Change) -> String {
    match change {
        Change::Added { size } => format!("added ({size} bytes)"),
        Change::Removed { size } => format!("REMOVED (was {size} bytes)"),
        Change::Grown { from, to, pct } => {
            format!("grew {from} -> {to} (+{pct:.2}%)")
        }
        Change::Shrunk { from, to, pct } => {
            format!("shrank {from} -> {to} ({pct:.2}%)")
        }
        Change::Regressed { from, to, pct } => {
            format!("REGRESSED {from} -> {to} (+{pct:.2}%)")
        }
        Change::Unchanged { size } => format!("unchanged ({size} bytes)"),
    }
}

fn flag(args: &[String], name: &str) -> Option<String> {
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if arg == name {
            return iter.next().cloned();
        }
        if let Some(rest) = arg.strip_prefix(&format!("{name}=")) {
            return Some(rest.to_string());
        }
    }
    None
}

fn print_usage() {
    println!("gas-snapshot - per-release contract gas/byte-size snapshots");
    println!();
    println!("USAGE:");
    println!("  gas-snapshot capture <wasm-dir> <out.json> --release <tag> [--timestamp <iso>]");
    println!("  gas-snapshot compare <current.json> <baseline.json> [--threshold <pct>]");
}

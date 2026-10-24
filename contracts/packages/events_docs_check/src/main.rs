//! CLI wrapper around the `events-docs-check` library.
//!
//! Usage:
//!   events-docs-check <packages-dir> <events-md>
//!
//! Exits non-zero when `EVENTS.md` drifts from the events emitted by the
//! contract sources, so CI can gate documentation accuracy.

use events_docs_check::{run_check, DriftReport};
use std::path::Path;
use std::process::ExitCode;

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
    match args.first().map(String::as_str) {
        Some("help" | "--help" | "-h") | None => {
            print_usage();
            Ok(ExitCode::SUCCESS)
        }
        Some(_) => {
            if args.len() < 2 {
                return Err("requires <packages-dir> <events-md>".to_string());
            }
            let packages = Path::new(&args[0]);
            let events_md = Path::new(&args[1]);
            let report = run_check(packages, events_md).map_err(|e| e.to_string())?;
            print_report(&report);
            Ok(if report.is_clean() {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            })
        }
    }
}

fn print_report(report: &DriftReport) {
    println!("=== Event documentation drift check ===");
    println!();
    if report.is_clean() {
        println!("OK: EVENTS.md is in sync with emitted contract events");
        return;
    }

    println!(
        "DRIFT: {} finding(s) between EVENTS.md and contract sources",
        report.total()
    );
    println!();

    if !report.undocumented.is_empty() {
        println!(
            "Undocumented events ({}): emitted in code, missing from EVENTS.md",
            report.undocumented.len()
        );
        for item in &report.undocumented {
            println!("  - {} at {}:{}", item.key, item.path.display(), item.line);
        }
        println!();
    }

    if !report.stale.is_empty() {
        println!(
            "Stale docs ({}): listed in EVENTS.md, not emitted by any source",
            report.stale.len()
        );
        for item in &report.stale {
            println!("  - {} at {}:{}", item.key, item.path.display(), item.line);
        }
    }
}

fn print_usage() {
    println!("events-docs-check - detect drift between EVENTS.md and emitted events");
    println!();
    println!("USAGE:");
    println!("  events-docs-check <packages-dir> <events-md>");
    println!();
    println!("Exits non-zero when EVENTS.md drifts from the contract sources.");
}

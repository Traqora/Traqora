//! Regression tests for the event documentation drift checker.
//!
//! Covers the happy path (clean docs) plus the two drift failure modes
//! (undocumented emitted event, stale documented event), the topic extractors
//! for both source and markdown, and the error case for a missing directory.

use events_docs_check::{
    check, extract_documented_events, extract_emitted_events, run_check, scan_sources, DriftError,
    EventKey, EventLocation,
};
use std::fs;
use std::path::{Path, PathBuf};

fn loc(topic: &str, action: &str) -> EventLocation {
    EventLocation {
        key: EventKey::new(topic, action),
        path: PathBuf::from("src/lib.rs"),
        line: 1,
    }
}

#[test]
fn extract_emitted_events_reads_symbol_topic_pairs() {
    let source = r#"
        env.events().publish(
            (symbol_short!("booking"), symbol_short!("created")),
            (passenger, timestamp, booking_id),
        );
        env.events().publish(
            (symbol_short!("booking"), symbol_short!("paid")),
            (passenger, timestamp, booking_id, amount),
        );
    "#;

    let events = extract_emitted_events(source);
    let keys: Vec<EventKey> = events.into_iter().map(|(k, _)| k).collect();
    assert_eq!(
        keys,
        vec![
            EventKey::new("booking", "created"),
            EventKey::new("booking", "paid"),
        ]
    );
}

#[test]
fn extract_emitted_events_handles_single_line_and_ignores_dynamic() {
    // A single-line call with identifiers (not symbol literals) must be skipped.
    let source = r#"
        env.events().publish((symbol_short!("airline"), symbol_short!("reg")), airline);
        env.events().publish((topic, action), payload);
        env.events().publish(symbol_short!("solo"), payload);
    "#;

    let events = extract_emitted_events(source);
    let keys: Vec<EventKey> = events.into_iter().map(|(k, _)| k).collect();
    assert_eq!(keys, vec![EventKey::new("airline", "reg")]);
}

#[test]
fn extract_documented_events_parses_table_rows_and_alts() {
    let markdown = "\
| topics | data | description |
|--------|------|-------------|
| `(booking, created)` | `(passenger, timestamp)` | New booking |
| `(booking, released)` | `(airline \\| oracle, timestamp, booking_id)` | Released |
| `(dispute, init)` | `jury_size` | Contract initialized |
";

    let docs = extract_documented_events(markdown);
    let keys: Vec<EventKey> = docs.into_iter().map(|(k, _)| k).collect();
    assert_eq!(
        keys,
        vec![
            EventKey::new("booking", "created"),
            EventKey::new("booking", "released"),
            EventKey::new("dispute", "init"),
        ]
    );
}

#[test]
fn check_is_clean_when_docs_match_emissions() {
    let emitted = vec![loc("booking", "created"), loc("refund", "approved")];
    let documented = vec![loc("booking", "created"), loc("refund", "approved")];

    let report = check(&emitted, &documented);
    assert!(report.is_clean());
    assert_eq!(report.total(), 0);
}

#[test]
fn check_reports_undocumented_emitted_event() {
    let emitted = vec![loc("booking", "created"), loc("booking", "cancelled")];
    let documented = vec![loc("booking", "created")];

    let report = check(&emitted, &documented);
    assert!(!report.is_clean());
    assert_eq!(report.undocumented.len(), 1);
    assert_eq!(
        report.undocumented[0].key,
        EventKey::new("booking", "cancelled")
    );
    assert!(report.stale.is_empty());
}

#[test]
fn check_reports_stale_documented_event() {
    let emitted = vec![loc("booking", "created")];
    let documented = vec![loc("booking", "created"), loc("upgrade", "rolled_back")];

    let report = check(&emitted, &documented);
    assert!(!report.is_clean());
    assert_eq!(report.stale.len(), 1);
    assert_eq!(report.stale[0].key, EventKey::new("upgrade", "rolled_back"));
    assert!(report.undocumented.is_empty());
}

#[test]
fn check_collapses_duplicate_emitter_locations() {
    // booking/released is emitted from both the airline and oracle paths.
    let emitted = vec![loc("booking", "released"), loc("booking", "released")];
    let documented = vec![loc("booking", "released")];

    let report = check(&emitted, &documented);
    assert!(report.is_clean());
}

#[test]
fn scan_sources_errors_on_missing_directory() {
    let missing = Path::new("/nonexistent/definitely/not/here");
    let err = scan_sources(missing).unwrap_err();
    assert_eq!(err, DriftError::DirNotFound(missing.to_path_buf()));
}

#[test]
fn run_check_detects_drift_in_a_temp_fixture() {
    let root = std::env::temp_dir().join(format!("events_docs_check_{}", std::process::id()));
    let pkg = root.join("packages").join("demo").join("src");
    fs::create_dir_all(&pkg).unwrap();

    fs::write(
        pkg.join("lib.rs"),
        r#"
        env.events().publish(
            (symbol_short!("demo"), symbol_short!("created")),
            payload,
        );
        env.events().publish(
            (symbol_short!("demo"), symbol_short!("removed_in_doc")),
            payload,
        );
        "#,
    )
    .unwrap();

    let events_md = root.join("EVENTS.md");
    fs::write(
        &events_md,
        "| `(demo, created)` | x | y |\n| `(demo, stale)` | x | y |\n",
    )
    .unwrap();

    let report = run_check(&root.join("packages"), &events_md).unwrap();
    assert!(!report.is_clean());
    assert_eq!(report.undocumented.len(), 1);
    assert_eq!(
        report.undocumented[0].key,
        EventKey::new("demo", "removed_in_doc")
    );
    assert_eq!(report.stale.len(), 1);
    assert_eq!(report.stale[0].key, EventKey::new("demo", "stale"));

    fs::remove_dir_all(&root).ok();
}

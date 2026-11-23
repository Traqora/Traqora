//! Regression tests for the per-release gas snapshot capability.
//!
//! Covers the happy path (capture + compare within threshold), the key failure
//! mode (a contract growing beyond the threshold is reported as a regression),
//! and the error cases callers rely on (missing directory, empty directory,
//! malformed baseline, invalid threshold).

use gas_snapshot::{
    capture, compare, read_snapshot, to_json, write_snapshot, Change, GasSnapshotError, Snapshot,
};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

fn snapshot(release: &str, entries: &[(&str, u64)]) -> Snapshot {
    Snapshot {
        release: release.to_string(),
        generated_at: "2026-01-01T00:00:00Z".to_string(),
        contracts: entries
            .iter()
            .map(|(n, s)| (n.to_string(), *s))
            .collect::<BTreeMap<_, _>>(),
    }
}

fn temp_dir(tag: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("gas-snapshot-test-{}-{}", tag, std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn capture_reads_every_wasm_and_ignores_other_files() {
    let dir = temp_dir("capture");
    fs::write(dir.join("refund.wasm"), vec![0u8; 1024]).unwrap();
    fs::write(dir.join("token.wasm"), vec![0u8; 2048]).unwrap();
    fs::write(dir.join("notes.txt"), b"ignore me").unwrap();

    let snap = capture(&dir, "v1.2.3", "2026-01-01T00:00:00Z").unwrap();

    assert_eq!(snap.release, "v1.2.3");
    assert_eq!(snap.contracts.get("refund.wasm"), Some(&1024));
    assert_eq!(snap.contracts.get("token.wasm"), Some(&2048));
    assert_eq!(snap.contracts.len(), 2, "non-wasm files must be ignored");

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn capture_fails_when_directory_missing() {
    let missing = std::env::temp_dir().join("gas-snapshot-does-not-exist-xyz");
    let err = capture(&missing, "v0", "now").unwrap_err();
    assert_eq!(err, GasSnapshotError::WasmDirNotFound(missing));
}

#[test]
fn capture_fails_when_no_wasm_files_present() {
    let dir = temp_dir("empty");
    fs::write(dir.join("readme.md"), b"no wasm here").unwrap();
    let err = capture(&dir, "v0", "now").unwrap_err();
    assert_eq!(err, GasSnapshotError::NoWasmFiles(dir.clone()));
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn compare_within_threshold_is_not_a_regression() {
    let baseline = snapshot("v1", &[("refund.wasm", 1000), ("token.wasm", 2000)]);
    // refund grows 3% (under default-ish 5%), token shrinks.
    let current = snapshot("v2", &[("refund.wasm", 1030), ("token.wasm", 1900)]);

    let cmp = compare(&baseline, &current, 5.0).unwrap();

    assert!(!cmp.has_regression());
    assert!(matches!(cmp.changes["refund.wasm"], Change::Grown { .. }));
    assert!(matches!(cmp.changes["token.wasm"], Change::Shrunk { .. }));
}

#[test]
fn compare_unchanged_contract_reports_unchanged() {
    let baseline = snapshot("v1", &[("refund.wasm", 1000)]);
    let current = snapshot("v2", &[("refund.wasm", 1000)]);
    let cmp = compare(&baseline, &current, 0.0).unwrap();
    assert!(!cmp.has_regression());
    assert_eq!(cmp.changes["refund.wasm"], Change::Unchanged { size: 1000 });
}

#[test]
fn compare_flags_regression_beyond_threshold() {
    let baseline = snapshot("v1", &[("refund.wasm", 1000)]);
    // refund grows 10% -> exceeds 5% threshold.
    let current = snapshot("v2", &[("refund.wasm", 1100)]);

    let cmp = compare(&baseline, &current, 5.0).unwrap();

    assert!(cmp.has_regression());
    assert_eq!(cmp.regressions(), vec!["refund.wasm"]);
    match &cmp.changes["refund.wasm"] {
        Change::Regressed { from, to, pct } => {
            assert_eq!((*from, *to), (1000, 1100));
            assert!((pct - 10.0).abs() < 1e-9);
        }
        other => panic!("expected Regressed, got {other:?}"),
    }
}

#[test]
fn compare_threshold_is_inclusive_boundary() {
    // Exactly at threshold must NOT regress; one byte over must.
    let baseline = snapshot("v1", &[("c.wasm", 1000)]);
    let at = snapshot("v2", &[("c.wasm", 1050)]);
    let over = snapshot("v2", &[("c.wasm", 1051)]);

    assert!(!compare(&baseline, &at, 5.0).unwrap().has_regression());
    assert!(compare(&baseline, &over, 5.0).unwrap().has_regression());
}

#[test]
fn compare_removed_contract_is_a_regression() {
    let baseline = snapshot("v1", &[("refund.wasm", 1000), ("token.wasm", 2000)]);
    let current = snapshot("v2", &[("refund.wasm", 1000)]);

    let cmp = compare(&baseline, &current, 5.0).unwrap();

    assert!(cmp.has_regression());
    assert_eq!(cmp.changes["token.wasm"], Change::Removed { size: 2000 });
}

#[test]
fn compare_added_contract_is_not_a_regression() {
    let baseline = snapshot("v1", &[("refund.wasm", 1000)]);
    let current = snapshot("v2", &[("refund.wasm", 1000), ("new.wasm", 500)]);

    let cmp = compare(&baseline, &current, 5.0).unwrap();

    assert!(!cmp.has_regression());
    assert_eq!(cmp.changes["new.wasm"], Change::Added { size: 500 });
}

#[test]
fn compare_rejects_invalid_threshold() {
    let baseline = snapshot("v1", &[("c.wasm", 1000)]);
    let current = snapshot("v2", &[("c.wasm", 1000)]);
    assert_eq!(
        compare(&baseline, &current, -1.0).unwrap_err(),
        GasSnapshotError::InvalidThreshold(-1.0)
    );
    assert!(matches!(
        compare(&baseline, &current, f64::NAN).unwrap_err(),
        GasSnapshotError::InvalidThreshold(t) if t.is_nan()
    ));
}

#[test]
fn json_round_trips_through_disk() {
    let dir = temp_dir("roundtrip");
    let path = dir.join("nested").join("gas-snapshot.json");
    let original = snapshot("v9.9.9", &[("a.wasm", 111), ("b.wasm", 222)]);
    write_snapshot(&path, &original).unwrap();

    let loaded = read_snapshot(&path).unwrap();
    assert_eq!(loaded, original);

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn read_snapshot_reports_parse_error_for_garbage() {
    let dir = temp_dir("garbage");
    let path = dir.join("bad.json");
    fs::write(&path, "{ not valid json").unwrap();

    let err = read_snapshot(&path).unwrap_err();
    match err {
        GasSnapshotError::Parse { path: p, .. } => assert_eq!(p, path),
        other => panic!("expected Parse error, got {other:?}"),
    }

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn to_json_is_deterministic_and_sorted() {
    let snap = snapshot("v1", &[("z.wasm", 2), ("a.wasm", 1)]);
    let json = to_json(&snap);
    let a = json.find("a.wasm").unwrap();
    let z = json.find("z.wasm").unwrap();
    assert!(a < z, "contract keys must be sorted for stable diffs");
}

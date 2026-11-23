//! Gas snapshot tooling for Traqora contracts (issue #602).
//!
//! A *gas snapshot* records the on-chain cost footprint of every compiled
//! contract at a given release. Soroban charges CPU/instruction budget in
//! proportion to the executed WASM, so the compiled contract byte size is a
//! stable, environment-independent proxy that CI can capture without a running
//! network. Snapshots are committed per release and diffed against the previous
//! release so reviewers can spot per-contract cost regressions.
//!
//! This crate is intentionally dependency-free so it can be built and tested
//! without touching the Soroban SDK or the contract workspace toolchain.

use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

/// A single captured release snapshot.
///
/// `contracts` maps a WASM file name (e.g. `refund.wasm`) to its compiled size
/// in bytes. `BTreeMap` keeps the serialized order deterministic so snapshots
/// are stable across machines and diff cleanly in review.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    pub release: String,
    pub generated_at: String,
    pub contracts: BTreeMap<String, u64>,
}

/// Severity of a single contract's change between baseline and current.
#[derive(Debug, Clone, PartialEq)]
pub enum Change {
    /// New contract with no baseline entry.
    Added { size: u64 },
    /// Contract present in baseline but missing from the current snapshot.
    Removed { size: u64 },
    /// Contract grew within the allowed threshold.
    Grown { from: u64, to: u64, pct: f64 },
    /// Contract shrank (always accepted).
    Shrunk { from: u64, to: u64, pct: f64 },
    /// Contract grew beyond the allowed threshold — a regression.
    Regressed { from: u64, to: u64, pct: f64 },
    /// Contract byte size is unchanged.
    Unchanged { size: u64 },
}

impl Change {
    /// `true` when this change must fail the comparison.
    pub fn is_regression(&self) -> bool {
        matches!(self, Change::Regressed { .. } | Change::Removed { .. })
    }
}

/// Outcome of comparing a current snapshot against a baseline.
#[derive(Debug, Clone, PartialEq)]
pub struct Comparison {
    pub changes: BTreeMap<String, Change>,
    pub threshold_pct: f64,
}

impl Comparison {
    /// `true` when any contract regressed beyond the threshold (or was removed).
    pub fn has_regression(&self) -> bool {
        self.changes.values().any(Change::is_regression)
    }

    /// Contract names that regressed, sorted (BTreeMap iteration order).
    pub fn regressions(&self) -> Vec<&str> {
        self.changes
            .iter()
            .filter(|(_, c)| c.is_regression())
            .map(|(name, _)| name.as_str())
            .collect()
    }
}

/// Errors surfaced by capture/compare. Kept explicit so the CLI can exit with a
/// meaningful message and the shell wrapper can report the failure mode.
#[derive(Debug, PartialEq)]
pub enum GasSnapshotError {
    /// The WASM directory does not exist or is not a directory.
    WasmDirNotFound(PathBuf),
    /// The WASM directory exists but contains no `*.wasm` files.
    NoWasmFiles(PathBuf),
    /// A required file could not be read.
    Io { path: PathBuf, message: String },
    /// A snapshot file could not be parsed as valid snapshot JSON.
    Parse { path: PathBuf, message: String },
    /// The threshold is not a finite, non-negative number.
    InvalidThreshold(f64),
}

impl fmt::Display for GasSnapshotError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GasSnapshotError::WasmDirNotFound(p) => {
                write!(f, "wasm directory not found: {}", p.display())
            }
            GasSnapshotError::NoWasmFiles(p) => {
                write!(f, "no .wasm files found in {}", p.display())
            }
            GasSnapshotError::Io { path, message } => {
                write!(f, "failed to read {}: {}", path.display(), message)
            }
            GasSnapshotError::Parse { path, message } => {
                write!(f, "invalid snapshot {}: {}", path.display(), message)
            }
            GasSnapshotError::InvalidThreshold(t) => {
                write!(f, "invalid threshold percentage: {}", t)
            }
        }
    }
}

impl std::error::Error for GasSnapshotError {}

/// Capture a snapshot from every `*.wasm` file in `wasm_dir`.
///
/// `release` and `generated_at` are recorded verbatim (the caller passes the tag
/// and an ISO-8601 timestamp) so the snapshot file carries provenance.
pub fn capture(
    wasm_dir: &Path,
    release: &str,
    generated_at: &str,
) -> Result<Snapshot, GasSnapshotError> {
    if !wasm_dir.is_dir() {
        return Err(GasSnapshotError::WasmDirNotFound(wasm_dir.to_path_buf()));
    }

    let mut contracts = BTreeMap::new();
    let entries = fs::read_dir(wasm_dir).map_err(|e| GasSnapshotError::Io {
        path: wasm_dir.to_path_buf(),
        message: e.to_string(),
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| GasSnapshotError::Io {
            path: wasm_dir.to_path_buf(),
            message: e.to_string(),
        })?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("wasm") {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let size = entry
            .metadata()
            .map_err(|e| GasSnapshotError::Io {
                path: path.clone(),
                message: e.to_string(),
            })?
            .len();
        contracts.insert(name, size);
    }

    if contracts.is_empty() {
        return Err(GasSnapshotError::NoWasmFiles(wasm_dir.to_path_buf()));
    }

    Ok(Snapshot {
        release: release.to_string(),
        generated_at: generated_at.to_string(),
        contracts,
    })
}

/// Compare a `current` snapshot against a `baseline`, flagging any contract
/// whose size grew by more than `threshold_pct` percent as a regression.
pub fn compare(
    baseline: &Snapshot,
    current: &Snapshot,
    threshold_pct: f64,
) -> Result<Comparison, GasSnapshotError> {
    if !threshold_pct.is_finite() || threshold_pct < 0.0 {
        return Err(GasSnapshotError::InvalidThreshold(threshold_pct));
    }

    let mut changes = BTreeMap::new();

    for (name, &to) in &current.contracts {
        match baseline.contracts.get(name) {
            None => {
                changes.insert(name.clone(), Change::Added { size: to });
            }
            Some(&from) => {
                let change = classify(from, to, threshold_pct);
                changes.insert(name.clone(), change);
            }
        }
    }

    for (name, &size) in &baseline.contracts {
        if !current.contracts.contains_key(name) {
            changes.insert(name.clone(), Change::Removed { size });
        }
    }

    Ok(Comparison {
        changes,
        threshold_pct,
    })
}

/// Classify a single contract's size change against the threshold.
fn classify(from: u64, to: u64, threshold_pct: f64) -> Change {
    if from == to {
        return Change::Unchanged { size: to };
    }
    if to < from {
        let pct = pct_change(from, to);
        return Change::Shrunk { from, to, pct };
    }
    let pct = pct_change(from, to);
    if pct > threshold_pct {
        Change::Regressed { from, to, pct }
    } else {
        Change::Grown { from, to, pct }
    }
}

/// Percentage change from `from` to `to`. If `from` is zero any positive `to`
/// is treated as an infinite increase so it cannot slip under the threshold.
fn pct_change(from: u64, to: u64) -> f64 {
    if from == 0 {
        if to == 0 {
            0.0
        } else {
            f64::INFINITY
        }
    } else {
        (to as f64 - from as f64) / from as f64 * 100.0
    }
}

/// Render a snapshot as stable, pretty JSON (2-space indent).
pub fn to_json(snapshot: &Snapshot) -> String {
    let mut out = String::new();
    out.push_str("{\n");
    out.push_str(&format!(
        "  \"release\": {},\n",
        json_string(&snapshot.release)
    ));
    out.push_str(&format!(
        "  \"generated_at\": {},\n",
        json_string(&snapshot.generated_at)
    ));
    out.push_str("  \"contracts\": {");
    if snapshot.contracts.is_empty() {
        out.push('}');
    } else {
        out.push('\n');
        let total = snapshot.contracts.len();
        for (i, (name, size)) in snapshot.contracts.iter().enumerate() {
            out.push_str(&format!("    {}: {}", json_string(name), size));
            if i + 1 < total {
                out.push(',');
            }
            out.push('\n');
        }
        out.push_str("  }");
    }
    out.push_str("\n}\n");
    out
}

/// Write a snapshot to `path`, creating parent directories as needed.
pub fn write_snapshot(path: &Path, snapshot: &Snapshot) -> Result<(), GasSnapshotError> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| GasSnapshotError::Io {
                path: parent.to_path_buf(),
                message: e.to_string(),
            })?;
        }
    }
    fs::write(path, to_json(snapshot)).map_err(|e| GasSnapshotError::Io {
        path: path.to_path_buf(),
        message: e.to_string(),
    })
}

/// Read and parse a snapshot from `path`.
pub fn read_snapshot(path: &Path) -> Result<Snapshot, GasSnapshotError> {
    let raw = fs::read_to_string(path).map_err(|e| GasSnapshotError::Io {
        path: path.to_path_buf(),
        message: e.to_string(),
    })?;
    parse_snapshot(&raw).map_err(|message| GasSnapshotError::Parse {
        path: path.to_path_buf(),
        message,
    })
}

/// Parse the snapshot JSON produced by [`to_json`].
///
/// This is a deliberately small, purpose-built parser: it understands exactly
/// the flat snapshot schema (two string fields plus an object of string->int)
/// and rejects anything else. Hand-rolling avoids pulling serde into the
/// contract workspace solely for a CI tool.
fn parse_snapshot(raw: &str) -> Result<Snapshot, String> {
    let release = extract_string(raw, "release")?.ok_or("missing \"release\"")?;
    let generated_at = extract_string(raw, "generated_at")?.ok_or("missing \"generated_at\"")?;
    let body = extract_object(raw, "contracts").ok_or("missing \"contracts\" object")?;

    let mut contracts = BTreeMap::new();
    for pair in split_top_level(body) {
        let pair = pair.trim();
        if pair.is_empty() {
            continue;
        }
        let (key, value) = pair
            .split_once(':')
            .ok_or_else(|| format!("malformed contract entry: {pair}"))?;
        let key = key.trim();
        let name = parse_json_string(key).ok_or_else(|| format!("bad key: {key}"))?;
        let size: u64 = value
            .trim()
            .parse()
            .map_err(|_| format!("contract {name} size is not a non-negative integer"))?;
        contracts.insert(name, size);
    }

    Ok(Snapshot {
        release,
        generated_at,
        contracts,
    })
}

/// Escape and quote a JSON string.
fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Parse a quoted JSON string, handling the escapes [`json_string`] emits.
fn parse_json_string(s: &str) -> Option<String> {
    let s = s.trim();
    if s.len() < 2 || !s.starts_with('"') || !s.ends_with('"') {
        return None;
    }
    let inner = &s[1..s.len() - 1];
    let mut out = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next()? {
            '"' => out.push('"'),
            '\\' => out.push('\\'),
            'n' => out.push('\n'),
            'r' => out.push('\r'),
            't' => out.push('\t'),
            'u' => {
                let hex: String = chars.by_ref().take(4).collect();
                if hex.len() != 4 {
                    return None;
                }
                let code = u32::from_str_radix(&hex, 16).ok()?;
                out.push(char::from_u32(code)?);
            }
            _ => return None,
        }
    }
    Some(out)
}

/// Extract a top-level string field's value.
fn extract_string(raw: &str, field: &str) -> Result<Option<String>, String> {
    let Some(start) = raw.find(&format!("\"{field}\"")) else {
        return Ok(None);
    };
    let after = &raw[start + field.len() + 2..];
    let after = after
        .trim_start()
        .strip_prefix(':')
        .ok_or("expected ':'")?
        .trim_start();
    let value = parse_json_string(take_scalar(after)).ok_or("expected string value")?;
    Ok(Some(value))
}

/// Extract the raw contents of a top-level object field (without the braces).
fn extract_object<'a>(raw: &'a str, field: &str) -> Option<&'a str> {
    let start = raw.find(&format!("\"{field}\""))?;
    let after = raw[start + field.len() + 2..].trim_start();
    let after = after.strip_prefix(':')?.trim_start();
    let after = after.strip_prefix('{')?;
    // Find the matching closing brace (snapshot objects are not nested).
    let end = after.find('}')?;
    Some(&after[..end])
}

/// Return the scalar (non-object/array) slice of a value.
fn take_scalar(s: &str) -> &str {
    let end = s.find([',', '}', '\n']).unwrap_or(s.len());
    &s[..end]
}

/// Split a JSON object body on top-level commas (no nesting in the schema).
fn split_top_level(body: &str) -> Vec<&str> {
    body.split(',').collect()
}

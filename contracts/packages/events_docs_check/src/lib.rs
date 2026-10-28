//! Event documentation drift checker for Traqora contracts.
//!
//! `contracts/EVENTS.md` is the operator-facing reference for every event the
//! contracts emit. It is hand-maintained, so it silently drifts from the code
//! whenever an event is added, renamed, or removed and the doc is not updated.
//! Off-chain indexers and monitoring rely on that table being accurate, so a
//! stale doc is an operational hazard rather than a cosmetic one.
//!
//! This crate is a small, dependency-free checker that:
//!
//! 1. Extracts every *emitted* event topic pair from the contract sources
//!    (`env.events().publish((symbol_short!("a"), symbol_short!("b")), ..)`).
//! 2. Extracts every *documented* event topic pair from `EVENTS.md` tables.
//! 3. Diffs the two sets and reports drift in both directions:
//!    - **undocumented**: emitted in code but missing from the doc table.
//!    - **stale**: present in the doc table but no longer emitted.
//!
//! It is intentionally kept free of the Soroban SDK and third-party crates so
//! it can be built and tested with the plain toolchain, independent of the
//! contract workspace.
//!
//! Only the two topic symbols are compared, not the data payload. Payload
//! shapes change often and comparing them textually produces noise; the topic
//! pair is the stable, indexable identity of an event and the signal that
//! matters for off-chain consumers.

use std::collections::BTreeSet;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

/// The topic pair identifying a single event, e.g. `("booking", "created")`.
///
/// Topics are normalized to their bare symbol text (`symbol_short!("x")` -> `x`).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EventKey {
    pub topic: String,
    pub action: String,
}

impl EventKey {
    /// Construct a key from raw topic strings (already symbol-normalized).
    pub fn new(topic: impl Into<String>, action: impl Into<String>) -> Self {
        EventKey {
            topic: topic.into(),
            action: action.into(),
        }
    }
}

impl fmt::Display for EventKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({}, {})", self.topic, self.action)
    }
}

/// An emitted or documented event together with where it was found, so the
/// report can point a reviewer at the exact file and line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventLocation {
    pub key: EventKey,
    pub path: PathBuf,
    pub line: usize,
}

/// The drift between emitted events and the documentation.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DriftReport {
    /// Emitted in source but absent from `EVENTS.md`.
    pub undocumented: Vec<EventLocation>,
    /// Documented in `EVENTS.md` but not emitted by any contract source.
    pub stale: Vec<EventLocation>,
}

impl DriftReport {
    /// `true` when the docs are fully in sync with the code.
    pub fn is_clean(&self) -> bool {
        self.undocumented.is_empty() && self.stale.is_empty()
    }

    /// Total number of drift findings (both directions).
    pub fn total(&self) -> usize {
        self.undocumented.len() + self.stale.len()
    }
}

/// Errors surfaced while scanning sources or parsing the doc.
#[derive(Debug, PartialEq, Eq)]
pub enum DriftError {
    /// A directory required for the scan does not exist.
    DirNotFound(PathBuf),
    /// A file could not be read.
    Io { path: PathBuf, message: String },
}

impl fmt::Display for DriftError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DriftError::DirNotFound(p) => write!(f, "directory not found: {}", p.display()),
            DriftError::Io { path, message } => {
                write!(f, "failed to read {}: {}", path.display(), message)
            }
        }
    }
}

impl std::error::Error for DriftError {}

/// Extract every emitted event topic pair from a single Rust source string.
///
/// Recognizes the canonical publish form used across the contracts:
///
/// ```ignore
/// env.events().publish(
///     (symbol_short!("booking"), symbol_short!("created")),
///     payload,
/// );
/// ```
///
/// Both topics must be `symbol_short!("..")` literals; calls whose topics are
/// dynamic (variables, macros, non-literals) are skipped because they cannot be
/// statically matched against the doc. Returns keys in source order with their
/// 1-based line numbers.
pub fn extract_emitted_events(source: &str) -> Vec<(EventKey, usize)> {
    let mut out = Vec::new();
    let mut cursor = 0usize;

    while let Some(found) = source[cursor..].find(".publish(") {
        let publish_start = cursor + found;
        let open_paren = publish_start + ".publish".len();
        let line = line_of(source, publish_start);

        // Find the matching closing paren of this publish call so we only look
        // at its own argument list (nested parens inside the tuple are fine).
        if let Some(close) = matching_paren(source, open_paren) {
            let args = &source[open_paren + 1..close];
            if let Some(key) = parse_topic_tuple(args) {
                out.push((key, line));
            }
            cursor = close + 1;
        } else {
            cursor = open_paren + 1;
        }
    }

    out
}

/// Parse `(symbol_short!("a"), symbol_short!("b")), rest..` into an `EventKey`.
///
/// Returns `None` when the leading tuple does not contain exactly two
/// `symbol_short!` string literals (dynamic or single-topic events).
fn parse_topic_tuple(args: &str) -> Option<EventKey> {
    let trimmed = args.trim_start();
    let open = trimmed.find('(')?;
    if !trimmed[..open].trim().is_empty() {
        // The first argument is not a tuple of topics.
        return None;
    }
    let close = matching_paren(trimmed, open)?;
    let inner = &trimmed[open + 1..close];

    let symbols = extract_symbol_literals(inner);
    if symbols.len() == 2 {
        Some(EventKey::new(symbols[0].clone(), symbols[1].clone()))
    } else {
        None
    }
}

/// Extract the string contents of every `symbol_short!("..")` in `text`.
fn extract_symbol_literals(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cursor = 0usize;
    while let Some(found) = text[cursor..].find("symbol_short!(") {
        let start = cursor + found + "symbol_short!(".len();
        if let Some(end) = text[start..].find(')') {
            let literal = text[start..start + end].trim();
            if let Some(value) = unquote(literal) {
                out.push(value);
            }
            cursor = start + end + 1;
        } else {
            break;
        }
    }
    out
}

/// Return the inner text of a `"..."` string literal, or `None`.
fn unquote(literal: &str) -> Option<String> {
    let s = literal.trim();
    let inner = s.strip_prefix('"')?.strip_suffix('"')?;
    Some(inner.to_string())
}

/// Extract every documented event topic pair from the `EVENTS.md` tables.
///
/// Documented rows look like:
///
/// ```text
/// | `(booking, created)` | `(...)` | New booking created |
/// | `(airline \| oracle, timestamp, ...)` | ... | ... |
/// ```
///
/// Only the leading `(topic, action)` of the first backticked cell is used; any
/// `|` alternatives (e.g. `airline | oracle`) are reduced to their first
/// option, matching the first emitter in the source.
pub fn extract_documented_events(markdown: &str) -> Vec<(EventKey, usize)> {
    let mut out = Vec::new();
    for (i, raw_line) in markdown.lines().enumerate() {
        let line = i + 1;
        let trimmed = raw_line.trim_start();
        // Only table rows participate; the first backticked span on the row is
        // the `topics` cell. Parsing the span directly (rather than splitting on
        // `|`) keeps rows like `airline \| oracle` intact.
        if !trimmed.starts_with('|') {
            continue;
        }
        let Some(open) = trimmed.find('`') else {
            continue;
        };
        let Some(close_rel) = trimmed[open + 1..].find('`') else {
            continue;
        };
        let content = &trimmed[open + 1..open + 1 + close_rel];

        if let Some(key) = parse_doc_key(content) {
            out.push((key, line));
        }
    }
    out
}

/// Parse ``(booking, created)`` (an optionally-suffixed doc cell) into a key.
///
/// Cells may carry trailing payload examples like `(booking, created)` only, so
/// we take the first two comma-separated tokens inside the parentheses. A `|`
/// alternative such as `airline | oracle` is reduced to its first token.
fn parse_doc_key(content: &str) -> Option<EventKey> {
    let inner = content.trim();
    let inner = inner.strip_prefix('(')?.strip_suffix(')')?;
    let mut parts = inner.split(',');
    let topic = normalize_topic(parts.next()?)?;
    let action = normalize_topic(parts.next()?)?;
    Some(EventKey::new(topic, action))
}

/// Normalize a documented topic token: trim, drop `|` alternatives, strip any
/// markdown escaping, and keep only word characters (topics are bare symbols).
fn normalize_topic(token: &str) -> Option<String> {
    let first = token.split('|').next()?.trim();
    let cleaned: String = first
        .trim_matches(|c: char| c == '\\' || c == ' ')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect();
    if cleaned.is_empty() {
        return None;
    }
    Some(cleaned)
}

/// Walk `packages_root` for contract sources and collect every emitted event.
///
/// Skips paths containing `tests`, `test`, or `integration_examples.rs` so only
/// production contract code is considered.
pub fn scan_sources(packages_root: &Path) -> Result<Vec<EventLocation>, DriftError> {
    if !packages_root.is_dir() {
        return Err(DriftError::DirNotFound(packages_root.to_path_buf()));
    }

    let mut files = Vec::new();
    collect_rust_files(packages_root, &mut files)?;
    files.sort();

    let mut out = Vec::new();
    for path in files {
        let source = fs::read_to_string(&path).map_err(|e| DriftError::Io {
            path: path.clone(),
            message: e.to_string(),
        })?;
        for (key, line) in extract_emitted_events(&source) {
            out.push(EventLocation {
                key,
                path: path.clone(),
                line,
            });
        }
    }
    Ok(out)
}

/// Recursively collect `*.rs` files that look like contract source.
fn collect_rust_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), DriftError> {
    let entries = fs::read_dir(dir).map_err(|e| DriftError::Io {
        path: dir.to_path_buf(),
        message: e.to_string(),
    })?;
    for entry in entries {
        let entry = entry.map_err(|e| DriftError::Io {
            path: dir.to_path_buf(),
            message: e.to_string(),
        })?;
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if path.is_dir() {
            if name == "tests" || name == "target" || name == "events_docs_check" {
                continue;
            }
            collect_rust_files(&path, out)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("rs")
            && name != "integration_examples.rs"
        {
            out.push(path);
        }
    }
    Ok(())
}

/// Compute the drift between emitted events and the documentation.
///
/// `emitted` and `documented` carry their own locations; duplicates of the same
/// key across multiple emitters collapse to a single presence check.
pub fn check(emitted: &[EventLocation], documented: &[EventLocation]) -> DriftReport {
    let emitted_keys: BTreeSet<&EventKey> = emitted.iter().map(|e| &e.key).collect();
    let documented_keys: BTreeSet<&EventKey> = documented.iter().map(|e| &e.key).collect();

    let mut undocumented: Vec<EventLocation> = emitted
        .iter()
        .filter(|e| !documented_keys.contains(&e.key))
        .cloned()
        .collect();
    let mut stale: Vec<EventLocation> = documented
        .iter()
        .filter(|e| !emitted_keys.contains(&e.key))
        .cloned()
        .collect();

    // Collapse duplicate keys, keeping the first location seen.
    dedupe(&mut undocumented);
    dedupe(&mut stale);
    DriftReport {
        undocumented,
        stale,
    }
}

/// Keep only the first occurrence of each key.
fn dedupe(items: &mut Vec<EventLocation>) {
    let mut seen = BTreeSet::new();
    items.retain(|item| seen.insert(item.key.clone()));
}

/// Convenience: scan sources and parse the doc, then diff.
pub fn run_check(packages_root: &Path, events_md: &Path) -> Result<DriftReport, DriftError> {
    let emitted = scan_sources(packages_root)?;
    let markdown = fs::read_to_string(events_md).map_err(|e| DriftError::Io {
        path: events_md.to_path_buf(),
        message: e.to_string(),
    })?;
    let documented: Vec<EventLocation> = extract_documented_events(&markdown)
        .into_iter()
        .map(|(key, line)| EventLocation {
            key,
            path: events_md.to_path_buf(),
            line,
        })
        .collect();
    Ok(check(&emitted, &documented))
}

/// 1-based line number of a byte offset.
fn line_of(source: &str, offset: usize) -> usize {
    source[..offset.min(source.len())]
        .bytes()
        .filter(|&b| b == b'\n')
        .count()
        + 1
}

/// Given the byte index of an opening `(`, return the index of the matching `)`.
fn matching_paren(s: &str, open: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    if bytes.get(open) != Some(&b'(') {
        return None;
    }
    let mut depth = 0i32;
    let mut i = open;
    while i < bytes.len() {
        match bytes[i] {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            b'"' => {
                // Skip string literals so parens inside them are ignored.
                i += 1;
                while i < bytes.len() && bytes[i] != b'"' {
                    if bytes[i] == b'\\' {
                        i += 1;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

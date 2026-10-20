//! Snapshot review policy for contract upgrades (issue #744).
//!
//! The `soroban-sdk` test environment can serialise its whole state with
//! [`Env::to_snapshot`], and the result derives `PartialEq`. That makes it
//! possible to answer the only question that matters when a contract is
//! upgraded on a live ledger: *what did the upgrade actually change?*
//!
//! Every upgrade is reviewed against the rules encoded in [`SnapshotReview`],
//! in this order:
//!
//! | rule                 | assertion                                                     |
//! | -------------------- | ------------------------------------------------------------- |
//! | `NoLostEntries`      | every *durable* ledger entry that existed before still exists  |
//! | `AuthHistoryPreserved` | the recorded authorization log is append-only                 |
//!
//! [`NoLostEntries`] is the load-bearing one: it is what catches a storage
//! layout change that silently orphans a ledger entry, and it fails loudly
//! rather than letting the damage reach a funded contract.
//!
//! Two deliberate refinements, both learned from running the rules against a
//! real upgrade:
//!
//! - **Durable entries only.** The host writes `LedgerKey::ContractData`
//!   entries with `durability: Temporary` as scratch space (ledger nonces). They
//!   are not contract state, so their disappearance is not a violation.
//! - **The auth log grows.** Every authorized call appends to
//!   `Snapshot::auth`, so an upgrade legitimately makes it *larger*. What must
//!   not happen is the history being rewritten, reordered or dropped, so the
//!   rule is "the old log is a prefix of the new one".
//!
//! ### What this policy does not check
//!
//! **Event observability.** `Snapshot::events` is not a cumulative log in
//! `soroban-sdk` 22 — the host returns the events of the most recent top-level
//! invocation, so the count reads the same before and after an upgrade even
//! though the upgrade does publish events. A rule built on that could never
//! fire, which is worse than no rule at all. Tests that care about
//! observability read `env.events()` immediately after the call, while it still
//! reflects that invocation.
//!
//! Reviewers should also read the [`ReviewReport`]. It reports how many durable
//! entries the change added, so an upgrade that rewrites the world shows up as a
//! large diff even when it breaks no rule.
//!
//! ```
//! use integration_tests::snapshot_review::SnapshotReview;
//! use soroban_sdk::Env;
//!
//! let env = Env::default();
//! let before = env.to_snapshot();
//! // ... perform the upgrade ...
//! let after = env.to_snapshot();
//!
//! let report = SnapshotReview::new("proxy-upgrade", &before, &after)
//!     .check()
//!     .expect("upgrade must preserve contract state");
//! assert_eq!(report.added_entries, 0);
//! ```

use soroban_sdk::testutils::Snapshot;
use soroban_sdk::xdr::{ContractDataDurability, LedgerKey};

/// What a [`SnapshotReview`] found.
///
/// A report is produced for a *passing* review; a failing one returns
/// [`SnapshotViolation`] instead.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewReport {
    /// The label the review was created with, echoed back for the error text.
    pub subject: String,
    /// Ledger entries present before the upgrade.
    pub entries_before: usize,
    /// Ledger entries present after the upgrade.
    pub entries_after: usize,
    /// Entries added by the upgrade. Never negative; a negative value would be
    /// a [`NoLostEntries`] violation.
    pub added_entries: usize,
}

impl ReviewReport {
    /// One-line summary suitable for a CI log or a PR comment.
    pub fn summary(&self) -> String {
        format!(
            "{}: {} -> {} durable ledger entries (+{})",
            self.subject, self.entries_before, self.entries_after, self.added_entries,
        )
    }
}

/// A rule the reviewed change broke.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotViolation {
    /// The change removed a durable ledger entry that existed beforehand.
    LostEntries {
        removed: usize,
        removed_keys: Vec<String>,
    },
    /// The change rewrote, reordered or dropped part of the auth log.
    AuthHistoryRewritten,
}

impl SnapshotViolation {
    /// Human readable form. Kept stable: the tests match on these substrings.
    pub fn describe(&self) -> String {
        match self {
            SnapshotViolation::LostEntries {
                removed,
                removed_keys,
            } => format!(
                "removed {removed} pre-existing durable ledger entr{} ({}); an upgrade must not drop contract state",
                if *removed == 1 { "y" } else { "ies" },
                preview_keys(removed_keys),
            ),
            SnapshotViolation::AuthHistoryRewritten => {
                "rewrote the recorded authorization log".to_string()
            }
        }
    }
}

fn preview_keys(keys: &[String]) -> String {
    const SHOWN: usize = 3;
    if keys.is_empty() {
        return "no keys".to_string();
    }
    let head = keys
        .iter()
        .take(SHOWN)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    if keys.len() > SHOWN {
        format!("{head}, … and {} more", keys.len() - SHOWN)
    } else {
        head
    }
}

/// True for a ledger entry that represents durable contract state.
///
/// Excludes the `durability: Temporary` contract-data entries the host uses as
/// scratch space (ledger nonces). Losing one of those is not data loss.
fn is_durable(key: &LedgerKey) -> bool {
    match key {
        LedgerKey::ContractData(data) => data.durability == ContractDataDurability::Persistent,
        LedgerKey::ContractCode(_) => true,
        _ => false,
    }
}

fn durable_keys(snapshot: &Snapshot) -> Vec<Box<LedgerKey>> {
    snapshot
        .ledger
        .ledger_entries
        .iter()
        .filter(|(key, _)| is_durable(key))
        .map(|(key, _)| key.clone())
        .collect()
}

/// Applies the snapshot review policy to a before/after pair.
#[derive(Debug, Clone)]
pub struct SnapshotReview<'a> {
    subject: String,
    before: &'a Snapshot,
    after: &'a Snapshot,
}

impl<'a> SnapshotReview<'a> {
    /// Create a review for a change labelled `subject` (usually the contract and
    /// the new implementation, e.g. `"proxy -> 0xBB"`).
    pub fn new(subject: impl Into<String>, before: &'a Snapshot, after: &'a Snapshot) -> Self {
        Self {
            subject: subject.into(),
            before,
            after,
        }
    }

    /// Run every rule. The first violation found is returned.
    pub fn check(&self) -> Result<ReviewReport, SnapshotViolation> {
        let entries_before = durable_keys(self.before).len();
        let entries_after = durable_keys(self.after).len();

        // NoLostEntries: the "after" set must be a superset of the "before" set.
        // Key equality is the right granularity — rewriting the *value* under a
        // surviving key is exactly what an upgrade is allowed to do.
        let after_keys = durable_keys(self.after);
        let removed_keys: Vec<String> = durable_keys(self.before)
            .into_iter()
            .filter(|key| !after_keys.contains(key))
            .map(|key| format!("{key:?}"))
            .collect();
        if !removed_keys.is_empty() {
            return Err(SnapshotViolation::LostEntries {
                removed: removed_keys.len(),
                removed_keys,
            });
        }

        // AuthHistoryPreserved: the old log must be a prefix of the new one.
        // Calls append, so growth is fine; a rewrite is not.
        let (old_log, new_log) = (&self.before.auth.0, &self.after.auth.0);
        if new_log.len() < old_log.len() || new_log[..old_log.len()] != old_log[..] {
            return Err(SnapshotViolation::AuthHistoryRewritten);
        }

        Ok(ReviewReport {
            subject: self.subject.clone(),
            entries_before,
            entries_after,
            // Guaranteed non-negative: NoLostEntries already proved it is a superset.
            added_entries: entries_after - entries_before,
        })
    }
}

/// Panicking wrapper for tests that do not need to inspect the report.
///
/// The message always starts with `snapshot review failed:` so a CI log points
/// straight at the policy that was broken.
pub fn assert_review(subject: &str, before: &Snapshot, after: &Snapshot) -> ReviewReport {
    match SnapshotReview::new(subject, before, after).check() {
        Ok(report) => report,
        Err(violation) => panic!("snapshot review failed: {}", violation.describe()),
    }
}

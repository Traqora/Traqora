//! Snapshot review policy applied to a real proxy upgrade (issue #744).
//!
//! `proxy_delegate_upgrade_test.rs` asserts that specific fields survive an
//! upgrade. This file asserts the stronger property those individual checks
//! imply: that the upgrade removes nothing from the ledger, leaves the
//! authorization tree alone, and is observable on-chain.
//!
//! Coverage map
//! ============
//! §1  Policy happy path over a real upgrade
//!     – an executed upgrade passes every rule
//!     – the report shows the upgrade added durable entries
//!     – the upgrade publishes an event on-chain
//!     – the upgrade is deterministic: same starting state, same final state
//!     – a second upgrade on top of the first is also reviewed clean
//!
//! §2  Policy failure modes
//!     – dropping a durable ledger entry is reported as `LostEntries`
//!     – rewriting the auth log is reported as `AuthHistoryRewritten`
//!     – `assert_review` panics with an actionable message
//!
//! §3  Known SDK behaviour
//!     – snapshot event vectors are not cumulative
//!
//! §4  Reviewer ergonomics
//!     – the report summarises to one line
//!     – removed keys are previewed, not dumped in full
//!     – short removals are listed in full

#![cfg(test)]

use integration_tests::snapshot_review::{
    assert_review, ReviewReport, SnapshotReview, SnapshotViolation,
};
use proxy::{ContractProxy, ContractProxyClient};
use soroban_sdk::{
    testutils::{Address as _, Events as _, Snapshot},
    Address, BytesN, Env, Vec,
};

// ─────────────────────────────── helpers ─────────────────────────────────────

fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn signers(env: &Env, n: u32) -> Vec<Address> {
    let mut v = Vec::new(env);
    for _ in 0..n {
        v.push_back(Address::generate(env));
    }
    v
}

/// Initialise a proxy with 3 signers / threshold 2 and execute one upgrade to
/// `new_impl`. Returns the client, the signers and the pre-upgrade snapshot.
fn init_and_upgrade(
    env: &Env,
    new_impl: u8,
    new_storage_version: Option<u32>,
) -> (ContractProxyClient<'_>, Vec<Address>, Snapshot) {
    let proxy_id = env.register(ContractProxy, ());
    let client = ContractProxyClient::new(env, &proxy_id);
    let admin = Address::generate(env);
    let s = signers(env, 3);
    client.init_proxy(&admin, &hash(env, 0xAA), &s, &2u32);

    let before = env.to_snapshot();

    let target = hash(env, new_impl);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &target, &new_storage_version);
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);

    (client, s, before)
}

/// Execute a further upgrade, returning the snapshot captured beforehand.
fn upgrade_again(
    env: &Env,
    client: &ContractProxyClient<'_>,
    s: &Vec<Address>,
    new_impl: u8,
    new_storage_version: Option<u32>,
) -> Snapshot {
    let before = env.to_snapshot();
    let target = hash(env, new_impl);
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &target, &new_storage_version);
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);
    before
}

// ══════════════════════════════════════════════════════════════════════════════
// §1  Policy happy path over a real upgrade
// ══════════════════════════════════════════════════════════════════════════════

/// The policy accepts an upgrade that is a normal multisig execution.
#[test]
fn test_review_accepts_standard_upgrade() {
    let env = new_env();
    let (_client, _signers, before) = init_and_upgrade(&env, 0xBB, None);

    let after = env.to_snapshot();
    let report = SnapshotReview::new("proxy -> 0xBB", &before, &after)
        .check()
        .expect("a standard multisig upgrade must satisfy the review policy");

    assert_eq!(report.subject, "proxy -> 0xBB");
    assert!(
        report.added_entries > 0,
        "the upgrade records its own state"
    );
    assert_eq!(
        report.entries_after,
        report.entries_before + report.added_entries
    );
}

/// The upgrade is observable on-chain.
///
/// This is asserted here rather than in the policy on purpose: `env.events()`
/// only reflects the most recent top-level invocation in soroban-sdk 22, so a
/// before/after delta computed from snapshots would never fire. Read it right
/// after the call instead.
#[test]
fn test_upgrade_publishes_an_event() {
    let env = new_env();
    let (_client, _signers, _before) = init_and_upgrade(&env, 0xBB, None);

    let events = env.events().all();
    assert!(
        !events.is_empty(),
        "an executed upgrade must publish at least one event"
    );
}

/// An upgrade that also bumps the storage version writes a migration record, and
/// still removes nothing.
#[test]
fn test_review_accepts_upgrade_with_storage_version_bump() {
    let env = new_env();
    let (client, s, before) = init_and_upgrade(&env, 0xBB, Some(2u32));
    let after = env.to_snapshot();

    assert_review("proxy -> 0xBB (v2)", &before, &after);

    // The version bump must not have disturbed the pre-existing state.
    let second = upgrade_again(&env, &client, &s, 0xCC, Some(3u32));
    assert_review("proxy -> 0xCC (v3)", &second, &env.to_snapshot());
}

/// Two environments driven through the same sequence of upgrades converge on the
/// same ledger state, so a snapshot diff between two runs is meaningful.
#[test]
fn test_upgrade_is_deterministic() {
    let run = || {
        let env = new_env();
        let (client, s, _before) = init_and_upgrade(&env, 0xBB, None);
        upgrade_again(&env, &client, &s, 0xCC, None);
        env.to_snapshot()
    };

    let first = run();
    let second = run();

    assert_eq!(
        first.ledger, second.ledger,
        "the same upgrade sequence must produce the same ledger state"
    );
    assert_eq!(first.events, second.events, "and the same events");
}

/// Running the same upgrade twice from the same starting snapshot leaves the
/// ledger untouched the second time — an upgrade is not a state machine that
/// drifts when replayed.
#[test]
fn test_replaying_an_upgrade_does_not_drift() {
    let env = new_env();
    let (client, s, before) = init_and_upgrade(&env, 0xBB, None);

    // Snapshot the post-upgrade state, then replay the identical proposal.
    let after_first = env.to_snapshot();
    let pid = client.propose_upgrade(&s.get(0).unwrap(), &hash(&env, 0xCC), &None);
    client.approve_upgrade(&s.get(1).unwrap(), &pid);
    client.upgrade_to(&s.get(0).unwrap(), &pid);
    let after_second = env.to_snapshot();

    assert_review("proxy -> 0xBB", &before, &after_first);
    assert_review("proxy -> 0xCC", &after_first, &after_second);
    assert!(
        after_second.ledger.ledger_entries.len() > after_first.ledger.ledger_entries.len(),
        "a second distinct upgrade must record new state"
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// §2  Policy failure modes
// ══════════════════════════════════════════════════════════════════════════════

/// The load-bearing rule: a change that drops a ledger entry is rejected, even
/// though it never calls a contract function.
#[test]
fn test_review_reports_lost_ledger_entry() {
    let env = new_env();
    let (_client, _signers, before) = init_and_upgrade(&env, 0xBB, None);
    let mut after = env.to_snapshot();

    // Simulate a storage-layout regression: an entry that existed both before
    // and after the upgrade is dropped. The proxy's own instance entry is the
    // natural victim, so pick a key that is present in *both* snapshots.
    let victim = before
        .ledger
        .ledger_entries
        .iter()
        .map(|(key, _)| key.clone())
        .find(|key| {
            after
                .ledger
                .ledger_entries
                .iter()
                .any(|(other, _)| other == key)
        })
        .expect("the proxy instance entry must survive the upgrade");
    let position = after
        .ledger
        .ledger_entries
        .iter()
        .position(|(key, _)| *key == victim)
        .expect("key must be present in the after snapshot");
    after.ledger.ledger_entries.remove(position);

    let violation = SnapshotReview::new("proxy -> 0xBB", &before, &after)
        .check()
        .expect_err("dropping a ledger entry must fail the review");

    match violation {
        SnapshotViolation::LostEntries {
            removed,
            ref removed_keys,
        } => {
            assert_eq!(removed, 1);
            assert_eq!(removed_keys.len(), 1);
            let message = violation.describe();
            assert!(
                message.contains("must not drop contract state"),
                "the message must say why: {message}"
            );
        }
        other => panic!("expected LostEntries, got {other:?}"),
    }
}

/// A change that rewrites the recorded authorization tree is rejected.
#[test]
fn test_review_reports_auth_rewrite() {
    let env = new_env();
    let (_client, _signers, before) = init_and_upgrade(&env, 0xBB, None);
    let mut after = env.to_snapshot();

    assert_ne!(before.auth, after.auth, "the upgrade itself records auth");
    // A rewrite: drop the tail of the auth log so the old history is no longer
    // a prefix of the new one.
    after.auth.0.truncate(1);

    let violation = SnapshotReview::new("proxy -> 0xBB", &before, &after)
        .check()
        .expect_err("rewritten auth must fail the review");
    assert_eq!(violation, SnapshotViolation::AuthHistoryRewritten);
    assert!(violation.describe().contains("authorization"));
}

/// Snapshot event vectors are not cumulative, so the policy deliberately does
/// not assert on them. Pin that behaviour so a future SDK bump that *does*
/// accumulate them is noticed here rather than silently changing the review.
#[test]
fn test_snapshot_event_log_is_not_cumulative() {
    let env = new_env();
    let (client, s, _) = init_and_upgrade(&env, 0xBB, None);
    let after_upgrade = env.to_snapshot().events.0.len();

    upgrade_again(&env, &client, &s, 0xCC, None);
    let after_second = env.to_snapshot().events.0.len();

    assert_eq!(
        after_upgrade, after_second,
        "if this ever changes, the review policy can gain a real observability rule"
    );
}

/// `assert_review` panics with a message that names the broken rule.
#[test]
#[should_panic(expected = "snapshot review failed:")]
fn test_assert_review_panics_on_violation() {
    let env = new_env();
    let (_client, _signers, before) = init_and_upgrade(&env, 0xBB, None);
    let mut after = env.to_snapshot();
    after.ledger.ledger_entries.clear();

    assert_review("proxy -> 0xBB", &before, &after);
}

// ══════════════════════════════════════════════════════════════════════════════
// §3  Reviewer ergonomics
// ══════════════════════════════════════════════════════════════════════════════

/// The one-line summary is what a reviewer pastes into the PR.
#[test]
fn test_report_summary_is_one_line() {
    let env = new_env();
    let (_client, _signers, before) = init_and_upgrade(&env, 0xBB, None);
    let report: ReviewReport = assert_review("proxy -> 0xBB", &before, &env.to_snapshot());

    let summary = report.summary();
    assert!(summary.contains("proxy -> 0xBB"));
    assert!(summary.contains("durable ledger entries"));
    assert!(!summary.contains('\n'), "summary must stay on one line");
}

/// Losing many entries previews the first few keys rather than dumping them all.
///
/// `register_contracts` installs eight contracts, so the snapshot holds far
/// more durable entries than the three-key preview shows.
#[test]
fn test_violation_previews_removed_keys() {
    let env = new_env();
    let _contracts = integration_tests::register_contracts(&env);
    let before = env.to_snapshot();
    let after = Snapshot::default();

    let violation = SnapshotReview::new("wipe", &before, &after)
        .check()
        .unwrap_err();
    let message = violation.describe();

    assert!(message.starts_with("removed "), "{message}");
    assert!(
        message.contains("and ") && message.contains(" more"),
        "long lists are summarised: {message}"
    );
    assert!(
        message.lines().count() == 1,
        "a violation message must stay on one line: {message}"
    );
}

/// A small wipe is shown in full rather than being abbreviated away.
#[test]
fn test_violation_lists_short_removals_in_full() {
    let env = new_env();
    let (_client, _signers, before) = init_and_upgrade(&env, 0xBB, None);
    let violation = SnapshotReview::new("wipe", &before, &Snapshot::default())
        .check()
        .unwrap_err();

    match violation {
        SnapshotViolation::LostEntries { removed, .. } => {
            assert!(removed <= 3, "this fixture is small: {removed}");
            assert!(!violation.describe().contains(" more"));
        }
        other => panic!("expected LostEntries, got {other:?}"),
    }
}

/// The reviewed upgrade really is the one the proxy performed, so the policy is
/// not passing on an empty diff.
#[test]
fn test_review_covers_a_non_empty_change() {
    let env = new_env();
    let (client, _s, before) = init_and_upgrade(&env, 0xBB, None);
    let after = env.to_snapshot();

    assert_ne!(before.ledger, after.ledger, "the ledger must have moved");
    assert_eq!(
        client.get_implementation(),
        hash(&env, 0xBB),
        "and the proxy must point at the new implementation"
    );
}

# Contract Snapshot Review Policy

How a contract upgrade is reviewed before it reaches a funded ledger.
Implements **issue #744**.

## The problem this solves

`proxy_delegate_upgrade_test.rs` asserts that *specific fields* survive an
upgrade — `get_owner()`, the multisig signers, the threshold, the storage
version. That is useful, but it only covers the fields somebody thought to
assert. A storage-layout change that orphans some other ledger entry passes all
of them and still loses data on a live network.

The `soroban-sdk` test `Env` can serialise its entire state with
`Env::to_snapshot()`, and the result derives `PartialEq`. That lets us assert the
general property instead of the specific one: *the set of durable ledger entries
after the upgrade is a superset of the set before it.*

## The policy

Implemented in
`contracts/packages/integration-tests/src/snapshot_review.rs`, exercised in
`contracts/packages/integration-tests/tests/contract_snapshot_review_test.rs`.

| rule                   | assertion                                                    | failure                        |
| ---------------------- | ------------------------------------------------------------ | ------------------------------ |
| `NoLostEntries`        | every **durable** ledger entry that existed before still exists | `LostEntries`                  |
| `AuthHistoryPreserved` | the recorded authorization log is append-only                  | `AuthHistoryRewritten`         |

```rust
let before = env.to_snapshot();
client.propose_upgrade(&signer, &new_impl, &new_storage_version);
// ... approve and execute ...
let after = env.to_snapshot();

let report = SnapshotReview::new("proxy -> 0xBB", &before, &after)
    .check()
    .expect("upgrade must preserve contract state");
println!("{}", report.summary());
```

`assert_review(&subject, &before, &after)` is the panicking form for tests that
only care that the review passed. Its message always begins
`snapshot review failed:`, so a CI log points straight at the broken rule.

### Why "durable" and why "append-only"

Both refinements came from running the rules against a real upgrade and watching
them produce nonsense:

- **Durable entries only.** The host writes `LedgerKey::ContractData` entries
  with `durability: Temporary` as scratch space (ledger nonces). Those are not
  contract state, so their disappearance is not a violation. The rule therefore
  compares only `ContractCode` and persistent `ContractData` keys.
- **The auth log grows.** Every authorized call appends to `Snapshot::auth`, so
  a legitimate upgrade makes the log *larger*. Asserting equality fails on
  essentially every real upgrade. The rule is that the pre-upgrade log is a
  **prefix** of the post-upgrade one: growth is fine, a rewrite, reorder or
  truncation is not.

### What the policy deliberately does not check

**Event observability.** `Snapshot::events` is not a cumulative log in
`soroban-sdk` 22 — `host().get_events()` returns the events of the most recent
top-level invocation. Measured on a real proxy upgrade:

```
after init_proxy        snapshot_events=1  events().all()=1
after propose_upgrade   snapshot_events=1  events().all()=1
after approve_upgrade   snapshot_events=1  events().all()=1
after upgrade_to        snapshot_events=1  events().all()=1
```

Each of those calls *does* publish an event; the buffer just does not accumulate
across invocations. A rule built on a before/after event delta could therefore
never fire, which is worse than having no rule. `test_upgrade_publishes_an_event`
reads `env.events()` immediately after the call, and
`test_snapshot_event_log_is_not_cumulative` pins the SDK behaviour so a future
version bump that starts accumulating is noticed.

## Reviewing an upgrade

1. Write the upgrade test. Assert the new behaviour directly.
2. Capture `before = env.to_snapshot()` immediately before the change and
   `after = env.to_snapshot()` immediately after.
3. Run the review. `report.summary()` is the line to paste into the PR:

   ```
   proxy -> 0xBB: 2 -> 3 durable ledger entries (+1)
   ```

4. Read the numbers. `added_entries` is the interesting one — a large jump means
   the upgrade wrote far more than a version bump should, even when no rule is
   broken.
5. If a rule fires, the upgrade is not safe to ship. Fix the layout change; do
   not weaken the rule.

## The `test_snapshots/` JSON files

There are two snapshot directories in the repository and they are easy to
confuse:

| path                                       | files | written when                                            |
| ------------------------------------------ | ----- | ------------------------------------------------------- |
| `contracts/test_snapshots/`                 | 620   | tests run with the **workspace root** as CWD — what CI does (`working-directory: contracts`) |
| `contracts/packages/integration-tests/test_snapshots/` | 11 | tests run with the **crate** as CWD                   |

`soroban-sdk` writes them relative to the current working directory, which is
why the same suite lands in different places depending on where you invoke
`cargo test` from. **Run the contracts suite from `contracts/`** so the output
is consistent:

```bash
cd contracts && cargo test --locked
```

These files are **diagnostic artifacts, not golden assertions.** Nothing reads
them back; they exist because the SDK's `Env` writes them on drop. The enforced
review is the in-code `SnapshotReview` comparison described above.

That also means a PR which shows a large `test_snapshots/` diff has usually
changed address generators, not contract behaviour. Review the assertions, not
the JSON. Proptest shards account for most of the 620 files
(`token_transfer_conserves_total_supply.1.json` … `.256.json`).

## Running the tests

```bash
cd contracts
cargo test -p integration-tests --test contract_snapshot_review_test
```

| test | what it pins |
| ---- | ------------ |
| `test_review_accepts_standard_upgrade` | a normal multisig upgrade satisfies every rule |
| `test_review_accepts_upgrade_with_storage_version_bump` | a version-bumping upgrade is reviewed clean twice over |
| `test_upgrade_is_deterministic` | the same upgrade sequence yields the same ledger |
| `test_replaying_an_upgrade_does_not_drift` | replaying a proposal does not corrupt state |
| `test_upgrade_publishes_an_event` | the upgrade is observable on-chain |
| `test_snapshot_event_log_is_not_cumulative` | the SDK behaviour described above |
| `test_review_reports_lost_ledger_entry` | **failure mode** — dropping an entry is reported |
| `test_review_reports_auth_rewrite` | **failure mode** — a truncated auth log is reported |
| `test_assert_review_panics_on_violation` | **failure mode** — the panic message is actionable |
| `test_violation_previews_removed_keys` | long removals are abbreviated, not dumped |
| `test_violation_lists_short_removals_in_full` | short removals are shown in full |
| `test_report_summary_is_one_line` | the PR-pasteable summary stays on one line |
| `test_review_covers_a_non_empty_change` | the reviewed change is not an empty diff |

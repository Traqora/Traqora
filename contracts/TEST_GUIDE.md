# Smart Contract Test Guide

This guide explains how the Traqora Soroban contracts are tested, and how to add a new contract test that runs in CI. It is written for contributors who have not worked with the contract test harness before.

---

## Overview

The contracts in this repository are Soroban smart contracts written in Rust. They are tested with the **soroban-sdk testutils** environment (`soroban-sdk` built with the `testutils` feature), which provides an in-memory ledger that lets tests exercise contract calls without a network, Stellar RPC, or real wallet signatures.

Tests live in the dedicated crates:

| Location | Purpose |
| --- | --- |
| `contracts/packages/integration-tests/src/lib.rs` | Shared test harness: env/fixture builders, contract registration, token initialization. |
| `contracts/packages/integration-tests/tests/*.rs` | Every `*.rs` file here is a Cargo **integration test binary**; each `#[test]` fn is one test case. |

CI (`.github/workflows/ci.yml`) runs `cargo fmt -- --check`, `cargo clippy` (wasm32, `-D warnings`), `cargo test --locked`, and a line-coverage gate (`cargo llvm-cov --summary-only --fail-under-lines 90`).

---

## Prerequisites

- **Rust toolchain**: `rustup update stable` (CI pins its own toolchain via `RUST_TOOLCHAIN`).
- **wasm32 target** (only needed for the `cargo clippy --target wasm32-unknown-unknown` check):
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **cargo-llvm-cov** (only needed when computing coverage locally):
  ```bash
  cargo install cargo-llvm-cov
  ```
- The contracts use `soroban-sdk` **22.x** (see `contracts/Cargo.toml`). The integration-tests crate enables the `testutils` feature.

---

## How the test harness works

Every test builds a `soroban_sdk::Env` — an in-memory Soroban runtime — then registers contracts into it and calls them through generated client types.

### The shared helper crate

`packages/integration-tests/src/lib.rs` exports fixtures so tests do not repeat setup boilerplate. The most commonly used helpers:

| Helper | What it does |
| --- | --- |
| `new_env()` | Returns an `Env::default()` with `env.mock_all_auths()` applied. |
| `generate_actors(&env)` | Generates `admin`, `passenger`, and `airline` addresses (`Actors`). |
| `register_contracts(&env)` | Registers token, booking, airline, loyalty, governance, refund, refund-automation, and booking-receipt contracts and returns typed clients (`Contracts`). |
| `initialize_token(&env, &token, &admin)` | Initializes the TRQ token (7-decimal, symbol `TRQ`). |
| `register_and_verify_airline(&env, &airline_client, &owner, &airline)` | Registers and verifies an airline so flight/booking flows succeed. |

A typical integration test therefore looks like:

```rust
use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};

#[test]
fn my_test() {
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    // ... call contracts via contracts.booking / contracts.token / ...
}
```

### Authorizations

- `new_env()` calls `env.mock_all_auths()`, which makes the host **pre-authorize every call**. Most workflow tests rely on this so they do not need to construct authorization entries.
- To assert that a "wrong" caller is rejected by business rules, call the `try_<fn>` variant of the method and assert `res.is_err()` (see the access-control example below).
- To test *signature-level* authorization, do **not** call `mock_all_auths()`; drive the call from an explicit `SourceAccount`/`Address::set_auth` as provided by the `soroban-sdk` testutils (see the `Envelope`/`AuthorizationContext` helpers in soroban-sdk). Most contract tests in this repo cover the business-rule layer via `try_*`.

### Important conventions

- **Token amounts use 7-decimal scaling.** `100_0000000i128` is 100 units; a token with 7 decimals stores it as the raw integer `1000000000`. Use the `_0000000` suffix to keep amounts readable.
- **`Symbol` vs `symbol_short!`.** `Symbol::new(&env, "...")` holds arbitrary (≤ 32-byte) strings. Event topics that fit in 9 characters use `soroban_sdk::symbol_short!("...")`.
- **Timestamps.** Set ledger time with `use soroban_sdk::testutils::Ledger;` and `env.ledger().set_timestamp(secs)` (or `env.ledger().with_mut(|li| li.timestamp += delta)`). Without the trait import, `set_timestamp` does not resolve.
- **Addresses.** Generate test addresses with `soroban_sdk::Address::generate(&env)` (requires `use soroban_sdk::testutils::Address as _;`).

---

## Writing your first test (worked example)

The steps below produce a complete, runnable booking-lifecycle test. It follows the exact API usage of `tests/booking_test.rs` and `tests/event_assertions_test.rs`.

### 1. Create the file

Add a new file under `packages/integration-tests/tests/`, e.g. `tests/booking_lifecycle_test.rs`. Cargo discovers integration tests automatically; nothing needs to be added to `Cargo.toml`.

### 2. Write the test

```rust
// tests/booking_lifecycle_test.rs
use soroban_sdk::testutils::Ledger;

use integration_tests::{generate_actors, initialize_token, new_env, register_contracts};

#[test]
fn test_full_booking_lifecycle() {
    // 1. Build the environment, actors, and contracts.
    let env = new_env();
    let actors = generate_actors(&env);
    let contracts = register_contracts(&env);
    initialize_token(&env, &contracts.token, &actors.admin);

    let price = 100_0000000i128; // 100 TRQ (7-decimal scaling)
    let departure_time = 1_705_000_000u64;
    env.ledger().set_timestamp(1_700_000_000);

    // 2. Passenger creates a booking (booking id is auto-incremented).
    let booking_id = contracts.booking.create_booking(
        &actors.passenger,
        &actors.airline,
        &soroban_sdk::Symbol::new(&env, "FL456"),
        &soroban_sdk::Symbol::new(&env, "JFK"),
        &soroban_sdk::Symbol::new(&env, "LAX"),
        &departure_time,
        &price,
        &contracts.token.address,
    );

    let booking = contracts.booking.get_booking(&booking_id).unwrap();
    assert_eq!(booking.status, soroban_sdk::Symbol::new(&env, "pending"));
    assert_eq!(booking.amount_escrowed, 0);

    // 3. Fund the passenger and pay for the booking (escrows the price).
    contracts.token.mint(&actors.admin, &actors.passenger, &price);
    contracts.booking.pay_for_booking(&booking_id);
    assert_eq!(
        contracts.token.balance_of(&actors.airline),
        0,
        "payment must not reach the airline before release"
    );

    // 4. Release payment to the airline once the trip is fulfilled.
    contracts.booking.release_payment_to_airline(&booking_id);
    assert_eq!(contracts.token.balance_of(&actors.airline), price);
}
```

### 3. Run it

```bash
cd contracts
cargo test -p integration-tests --test booking_lifecycle_test -- --nocapture
```

Expected output ends with something like `test test_full_booking_lifecycle ... ok` and a summary of `1 passed`.

### What each part does

- `new_env()` + `generate_actors()` + `register_contracts()` + `initialize_token()` set up a clean, self-contained ledger with a funded admin.
- `create_booking(...)` returns a `u64` booking id; state is read back with `get_booking(...)`, which returns `Option<Booking>`.
- `mint(...)` funds the passenger from the admin; `pay_for_booking(...)` triggers the escrow transfer to the booking contract, so the airline balance stays `0`.
- `release_payment_to_airline(...)` settles the escrow; the assertions verify the resulting state.

> When you add a new contract, define an analogous helper in `packages/integration-tests/src/lib.rs` (e.g. `register_<name>(&env) -> <Name>ContractClient`) so all test files share it. A test file should only ever call `integration_tests::...` helpers and the contract clients.

---

## Testing different behaviors

### Recording and asserting events

Workflow contracts (booking, governance, loyalty) publish events as `(contract, action)` topics with an `(actor, timestamp, id, ...payload)` data payload; the token contract uses `(action, status)` topics with `(from, to, amount)` data. Collect and inspect events with `env.events().all()`:

```rust
use soroban_sdk::testutils::Events;
use soroban_sdk::{IntoVal, TryIntoVal, Val, Address};

fn find_events(
    env: &Env,
    topic0: soroban_sdk::Symbol,
    topic1: soroban_sdk::Symbol,
) -> std::vec::Vec<(Address, soroban_sdk::Vec<Val>, Val)> {
    let t0 = topic0.to_val().get_payload();
    let t1 = topic1.to_val().get_payload();
    env.events()
        .all()
        .iter()
        .filter(|(_, topics, _)| {
            topics.len() == 2
                && topics.get(0).unwrap().get_payload() == t0
                && topics.get(1).unwrap().get_payload() == t1
        })
        .collect()
}
```

Full examples are in `tests/event_assertions_test.rs` (booking created/paid/released/refunded, refund requested/approved/rejected, loyalty points earned/redeemed).

### Expecting an operation to fail

Two options, depending on whether the failure is a panic or a rejected business rule:

```rust
// Business-rule rejection: use the try_* variant and inspect the Result.
let res = contracts.booking.try_create_booking(/* wrong caller args */);
assert!(res.is_err());

// Panic (e.g. invalid input): mark the test with should_panic.
#[test]
#[should_panic(expected = "Seat already reserved")]
fn test_double_booking_rejected() { /* ... */ }
```

See `tests/access_test.rs` and `tests/flight_booking_test.rs` for these patterns.

### Authorization / roles

```rust
let owner = Address::generate(&env);
let attacker = Address::generate(&env);
contracts.governance.init_governance(&owner, &3600);

let res = contracts.governance.try_transfer_ownership(&attacker, &owner);
assert!(res.is_err());
```

Note that with `mock_all_auths()` the host authorizes every call; the `try_*` pattern asserts the *contract's* role/ownership checks, not signature failures.

### Time-dependent behavior

```rust
env.ledger().set_timestamp(1_700_000_000u64);          // absolute
env.ledger().with_mut(|li| { li.timestamp += 4000; });  // relative
```

Tests that depend on booking departure times, vote deadlines, or escrow windows must set the ledger timestamp explicitly (see `booking_test.rs`, `governance_test.rs`).

### Property-based tests

`proptest` (a dev-dependency of the integration-tests crate) verifies invariants across many inputs:

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn token_transfer_conserves_total_supply(x in 1i128..10_000i128, y in 1i128..10_000i128) {
        let env = new_env();
        let actors = generate_actors(&env);
        let contracts = register_contracts(&env);
        initialize_token(&env, &contracts.token, &actors.admin);

        contracts.token.mint(&actors.admin, &actors.passenger, &x);
        contracts.token.mint(&actors.admin, &actors.airline, &y);
        contracts.token.transfer(&actors.passenger, &actors.airline, &1i128);

        prop_assert_eq!(
            contracts.token.balance_of(&actors.passenger) + contracts.token.balance_of(&actors.airline),
            x + y
        );
        prop_assert_eq!(contracts.token.total_supply(), x + y);
    }
}
```

See `tests/fuzz_property_test.rs` (token) and `tests/advanced_property_tests.rs` (booking/refund/loyalty bounds).

### Upgrade / storage-version tests

Contracts that implement upgrades or storage versioning are covered in `tests/upgrade_mechanism_test.rs` and `tests/storage_version_test.rs`. Upgrade helpers are exposed through the contract clients in the same way as ordinary methods.

---

## Running the tests

Run everything from the `contracts` directory:

| Command | Scope |
| --- | --- |
| `cargo test --workspace` | Every contract and the integration-tests crate. |
| `cargo test -p integration-tests` | Only the integration-test suite. |
| `cargo test -p integration-tests --test booking_test` | A single test binary (file). |
| `cargo test -p integration-tests --test booking_test test_refund_flow` | A single test by name. |
| `cargo test -p integration-tests -- --nocapture` | Show `println!`/`dbg!` output. |

CI uses `cargo test --locked` from the `contracts` directory, so keep `Cargo.lock` up to date when dependency versions change.

Formatting and linting (also gated in CI):

```bash
cargo fmt -- --check
cargo clippy --locked --target wasm32-unknown-unknown -- -D warnings
```

---

## Coverage

The contracts require **>= 90% line coverage** on contract code (CI runs `cargo llvm-cov --summary-only --fail-under-lines 90`). Coverage is measured over the contract crates themselves, not the integration-test crate.

Locally, use the wrapper script in `contracts/`:

```bash
./coverage.sh            # text summary
./coverage.sh --html     # HTML report in target/coverage/
./coverage.sh --html --open
```

Or invoke cargo-llvm-cov directly:

```bash
cargo llvm-cov --summary-only --fail-under-lines 90
```

> Coverage gates apply to whole crates. When adding a new contract, add enough tests to keep the aggregated line coverage at or above 90%; the CI step prints a per-file table when the threshold is missed.

---

## Navigating the existing tests

| File | Focus |
| --- | --- |
| `integration_test.rs` | Full booking → loyalty → refund workflow across contracts. |
| `comprehensive_integration_test.rs` | Extended workflows (payments, disputes, refund policy, multi-airline loyalty, governance refs). |
| `booking_test.rs`, `booking_errors_test.rs` | Booking creation, escrow, payment, refunds, error paths. |
| `booking_receipt_test.rs` | Booking receipt generation. |
| `flight_booking_test.rs`, `flight_registry_test.rs`, `airline_test.rs` | Flight booking, registry data, airline registration/verification. |
| `token_test.rs`, `fuzz_property_test.rs` | Token behavior and invariant testing. |
| `refund_test.rs`, `refund_automation_integration_test.rs` | Refund flows and automation. |
| `dispute_test.rs`, `dispute_resolution_test.rs`, `dispute_resolution_advanced_test.rs` | Disputes, arbiters, escrow security, jury rotation. |
| `loyalty_test.rs` | Loyalty points and tiers. |
| `governance_test.rs`, `access_test.rs` | Governance proposals, roles, ownership, access control. |
| `oracle_test.rs` | Price/data oracle integration. |
| `proxy_test.rs`, `proxy_access_test.rs` | Proxy contract behavior and access patterns. |
| `upgrade_mechanism_test.rs`, `storage_version_test.rs` | Contract upgrades and storage versioning. |
| `admin_multisig_test.rs` | Admin multisig operations. |
| `event_assertions_test.rs` | Event schema validation across contracts. |
| `advanced_property_tests.rs` | Critical invariant checks (supply, refund bounds, id sequencing, points scaling). |

`packages/integration-tests/test_snapshots/` contains stored ledger snapshots (`Env`-serialized JSON) from earlier snapshot-based runs. The current suite assertions are functional (in-process state checks); snapshot serialization remains available through `soroban-sdk`'s `Env::to_snapshot` if you need golden-state comparisons.

---

## Checklist for adding a test

1. Create `packages/integration-tests/tests/<module>_test.rs` (naming: `<feature>_test.rs`).
2. Name each test `test_<operation>_<expected_outcome>` (e.g. `test_refund_flow`, `test_double_booking_rejected`).
3. Reuse `integration_tests::{new_env, generate_actors, register_contracts, initialize_token, ...}` — do not reimplement env/register logic.
4. Use 7-decimal amount literals (`100_0000000i128`), `Symbol::new`/`symbol_short!`, and set ledger timestamps explicitly where time matters.
5. Cover at least: happy path, an error/boundary case, and any authorization-sensitive operation (`try_*` with `assert!(res.is_err())`).
6. Run locally:
   ```bash
   cargo test -p integration-tests --test <module>_test -- --nocapture
   cargo fmt -- --check
   cargo clippy --locked --target wasm32-unknown-unknown -- -D warnings
   cargo llvm-cov --summary-only --fail-under-lines 90
   ```
7. It will run in CI (`cargo test --locked` + coverage gate) automatically on your PR to `main`.

---

## Troubleshooting

**`register_and_verify_airline` / helpers no longer compile at call sites.**
The shared helpers in `packages/integration-tests/src/lib.rs` are the single source of truth. When a contract changes, helpers change with it; update every caller in `tests/*.rs`. If you see a compile error about a helper's argument count, check `src/lib.rs` for the current signature and fix the call sites.

**`set_timestamp` / `with_mut` does not exist.**
Add `use soroban_sdk::testutils::Ledger;` — these methods come from the `Ledger` test trait.

**`Address::generate` not found.**
Add `use soroban_sdk::testutils::Address as _;`.

**A call that should succeed panics with an `Auth`/`Authorized` error.**
You are probably not using `new_env()` (which calls `mock_all_auths()`); use `fn env = new_env()` or call `env.mock_all_auths()` after `Env::default()`.

**Token balance assertions are off by a factor of 10^7.**
Amounts are transmitted as raw integers with 7 implied decimals. `1_000_0000` is 1 token — use the `_0000000` grouping to read amounts as whole units.

**An operation I expected to fail returned `Ok`.**
Call the `try_<fn>` variant and assert `.is_err()`; only `#[should_panic]` tests assert on panics. Make sure the rejection is a business-rule failure (roles/ownership/state) rather than auth, since `mock_all_auths()` bypasses signature checks.

**Property tests rarely fail but sometimes do.**
`proptest` shrinks counterexamples; re-run with `PROPTEST_CASES=1000 cargo test -p integration-tests --test fuzz_property_test -- --nocapture` to reproduce, and `dbg!` the inputs inside the property function.

**The whole suite will not compile locally.**
Run `cargo check --tests -p integration-tests` first; fix compile errors in *your* file only. If a pre-existing test file fails to compile (for example after a contract API change), address it in a separate change so this test addition stays reviewable.

---

## Reference: contract surface used in tests

Most tests interact with the `Contracts` struct from `integration-tests::lib`:

- `token`: `init_token`, `mint`, `transfer`, `approve`, `transfer_from`, `balance_of`, `total_supply`
- `booking`: `create_booking`, `get_booking`, `pay_for_booking`, `release_payment_to_airline`, `refund_passenger`
- `airline`: `register_airline`, `verify_airline`, `get_airline`, `create_flight`
- `loyalty`: `init_loyalty`, `award_points`, `redeem_points`
- `governance`: `init_governance`, `create_proposal`, `execute_proposal`, `get_proposal`, `transfer_ownership`, `set_role`, `has_role`
- `refund`: `request_refund`, `process_refund`, `reject_refund`

Every client also exposes `try_<fn>` variants for the failure/authorization patterns described above.
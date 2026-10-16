# Contract Upgrade Mechanism — Quick Reference

## 30-Second Overview

A safe contract upgrade mechanism protected by a **48-hour timelock**:

1. Admin schedules upgrade → `UpgradeScheduled` event
2. 48 hours elapse (community review window)
3. Admin executes upgrade → `UpgradeExecuted` event
4. Contract updated with new WASM code
5. Next upgrade can be scheduled

## Core API

### Schedule Upgrade (Admin only)
```rust
pub fn schedule_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>)
```
- Only one upgrade can be pending at a time
- Stores `scheduled_at` timestamp from the ledger
- Emits `(upgrade, scheduled)` event

### Execute Upgrade (Admin only, after 48 h)
```rust
pub fn execute_upgrade(env: Env, admin: Address)
```
- Requires `now − scheduled_at >= timelock_duration` (default 48 h)
- Rejects premature execution with `"Timelock period not yet elapsed"`
- Marks the upgrade as executed; prevents double execution
- Emits `(upgrade, executed)` event

### Management Functions
```rust
pub fn cancel_upgrade(env: Env, owner: Address)                   // Owner only
pub fn set_timelock_duration(env: Env, owner: Address, dur: u64)  // Owner only
pub fn get_scheduled_upgrade(env: Env) -> Option<ScheduledUpgrade>
pub fn get_upgrade_timelock_remaining(env: Env) -> u64
pub fn get_timelock_duration(env: Env) -> u64
```

`get_upgrade_timelock_remaining` returns:
- `0` — no upgrade scheduled, or timelock already elapsed, or upgrade executed
- `N > 0` — seconds remaining before execution is allowed

## Integration (2 Steps)

### Step 1: Add Imports
```rust
use upgrade::{UpgradeContract, UpgradeStorage};
use soroban_sdk::BytesN;
```

### Step 2: Delegate to `UpgradeContract` in Your Contract
```rust
pub fn schedule_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
    UpgradeContract::schedule_upgrade(env, admin, new_wasm_hash);
}

pub fn execute_upgrade(env: Env, admin: Address) {
    UpgradeContract::execute_upgrade(env, admin);
}

pub fn get_upgrade_timelock_remaining(env: Env) -> u64 {
    UpgradeContract::get_upgrade_timelock_remaining(env)
}
```

## Timeline

```
T+0h:  Admin calls schedule_upgrade(new_hash)
       → UpgradeScheduled event
       → Wait period begins (community review)

T+48h: Timelock expires
       Admin calls execute_upgrade()
       → UpgradeExecuted event
       → New WASM hash recorded

T+48h+: Next upgrade can be scheduled
```

## Key Properties

| Property           | Value                                  |
|--------------------|----------------------------------------|
| Default Timelock   | 48 hours (172 800 seconds)             |
| Minimum Wait       | Configurable (default 48 h)            |
| Admin Role         | Required to schedule/execute           |
| Owner Role         | Required to configure/cancel           |
| Event Type         | Emitted for all state changes          |
| Storage            | Instance storage (persistent)          |
| Concurrent pending | At most one pending upgrade at a time  |

## Error Reference

Errors that originate in `AccessControl` (`require_admin` / `require_owner`) are
emitted via `panic_with_error!` and surface as structured `ContractError` codes
when called through a registered contract client. Plain `assert!`/`panic!` errors
in `UpgradeContract` surface as string messages.

| Situation | Source | Error type | Panic / `try_*` message |
|-----------|--------|-----------|------------------------|
| Caller lacks Admin role | `AccessControl::require_admin` | `ContractError::NotAdmin` (#2) | `HostError: Error(Contract, #2)` |
| Caller lacks Owner role | `AccessControl::require_owner` | `ContractError::NotOwner` (#1) | `HostError: Error(Contract, #1)` |
| Execute before timelock | `assert!` in `execute_upgrade` | string panic | `"Timelock period not yet elapsed"` |
| No upgrade scheduled | `expect()` in `execute_upgrade` / `cancel_upgrade` | string panic | `"No upgrade scheduled"` |
| Upgrade already executed | `assert!` in `execute_upgrade` | string panic | `"Upgrade already executed"` |
| Second pending upgrade | `panic!` in `schedule_upgrade` | string panic | `"Upgrade already scheduled and pending execution"` |
| Cancel executed upgrade | `assert!` in `cancel_upgrade` | string panic | `"Cannot cancel an executed upgrade"` |
| Zero timelock duration | `assert!` in `set_timelock_duration` | string panic | `"Timelock duration must be positive"` |

> **Testing tip:** For auth-guard tests that call through the contract client,
> use `try_<fn>` and assert `result.is_err()` rather than `#[should_panic]`.
> For business-rule panics (`"Timelock period not yet elapsed"` etc.),
> `#[should_panic(expected = "...")]` works correctly.
> See `upgrade_quickref_test.rs` for canonical examples of both patterns.

## Events

All events follow the canonical two-topic schema used across Traqora contracts:
`topics = (domain_symbol, action_symbol)`.

```
(upgrade, scheduled)
  data: (new_wasm_hash: BytesN<32>, scheduled_at: u64, scheduled_by: Address)

(upgrade, executed)
  data: (new_wasm_hash: BytesN<32>, executed_at: u64, executed_by: Address)

(upgrade, cancelled)
  data: (new_wasm_hash: BytesN<32>, cancelled_by: Address)

(upgrade, timelock)
  data: (new_duration: u64, updated_by: Address)
```

## Workflows

### Normal Flow
```
1. Admin calls schedule_upgrade(new_hash)
2. System stores upgrade + timestamp; emits UpgradeScheduled
3. Wait 48 hours (community review, monitoring alerts)
4. Admin calls execute_upgrade()
5. System verifies 48 h passed; emits UpgradeExecuted
6. Next upgrade can be scheduled
```

### Emergency Flow (reduced timelock)
```
1. Owner calls set_timelock_duration(3600)   // 1 hour
2. Admin calls schedule_upgrade(new_hash)
3. Wait 1 hour
4. Admin calls execute_upgrade()
5. Owner calls set_timelock_duration(172800) // Restore to 48 h
```

### Cancellation Flow
```
1. Admin calls schedule_upgrade(new_hash)
2. Owner decides to cancel
3. Owner calls cancel_upgrade()             // clears pending upgrade
4. Can now schedule a different upgrade
```

## Security Model

| Component  | Access guard                     | Note                                  |
|------------|----------------------------------|---------------------------------------|
| schedule   | `AccessControl::require_admin`   | Proposer must hold Admin role         |
| execute    | `AccessControl::require_admin`   | + 48-hour timelock enforced at call time |
| configure  | `AccessControl::require_owner`   | Owner can adjust timelock duration    |
| cancel     | `AccessControl::require_owner`   | Owner can abort a pending upgrade     |
| read fns   | (none)                           | Public, read-only                     |

## Files

| File | Purpose |
|------|---------|
| `contracts/packages/upgrade/src/lib.rs` | Core implementation + inline unit tests |
| `contracts/packages/integration-tests/tests/upgrade_quickref_test.rs` | **Quick-reference regression tests (28 tests)** |
| `contracts/packages/integration-tests/tests/upgrade_mechanism_test.rs` | Comprehensive unit-level tests (38 tests) |
| `UPGRADE_MECHANISM.md` | Full API reference |
| `UPGRADE_IMPLEMENTATION_GUIDE.md` | Step-by-step integration guide |
| `contracts/UPGRADE_PROCEDURE.md` | Operational procedure (proxy/multisig path) |

## Running Tests

```bash
# Quick-reference regression tests (this document)
cd contracts
cargo test -p integration-tests --test upgrade_quickref_test -- --nocapture

# Full upgrade mechanism unit tests
cargo test -p integration-tests --test upgrade_mechanism_test -- --nocapture

# All integration tests
cargo test -p integration-tests

# Lint (same gate as CI)
cargo fmt -- --check
cargo clippy --locked --target wasm32-unknown-unknown -- -D warnings
```

## Monitoring Checklist

- [ ] Subscribe to `(upgrade, scheduled)` events on-chain
- [ ] Alert stakeholders of pending upgrades within minutes of scheduling
- [ ] Wait minimum 48 hours (or the current configured timelock)
- [ ] Community reviews the new WASM code changes
- [ ] Confirm `(upgrade, executed)` event after execution
- [ ] Verify contract behaviour post-upgrade
- [ ] Document any breaking changes in release notes

## Common Questions

**Q: Can I execute an upgrade before 48 hours?**
A: No. The system panics with `"Timelock period not yet elapsed"`.

**Q: What if I made a mistake scheduling?**
A: The Owner can call `cancel_upgrade()` to cancel any pending (not yet executed) upgrade.

**Q: Can I change the 48-hour timelock?**
A: Yes. Owner calls `set_timelock_duration(seconds)`. Duration must be > 0.

**Q: Can I upgrade twice in a row?**
A: Yes. After the first upgrade executes, schedule the next one.

**Q: Who can execute upgrades?**
A: Any address holding the Admin role (same role required to schedule).

**Q: What happens to contract state during upgrade?**
A: State is preserved in full. Only the WASM bytecode changes.

**Q: Why do auth-guard failures show `HostError: Error(Contract, #N)` in tests?**
A: `AccessControl::require_admin/owner` uses `panic_with_error!` which emits a
   structured `ContractError` code. When called through a registered contract client,
   the SDK wraps this in a `HostError`. Use `try_<fn>` + `assert!(result.is_err())`
   to test these guards.

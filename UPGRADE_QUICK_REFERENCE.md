# Contract Upgrade Mechanism - Quick Reference

## 30-Second Overview

A safe contract upgrade mechanism protected by a **48-hour timelock**:
- Admins schedule upgrades
- 48 hours pass
- Admins execute upgrade
- Contract updated with new WASM code

## Core API

### Schedule Upgrade (Admin Only)
```rust
pub fn schedule_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>)
```
- Only one upgrade can be pending
- Emits `UpgradeScheduled` event
- Stores timestamp

### Execute Upgrade (After 48 Hours)
```rust
pub fn execute_upgrade(env: Env, admin: Address)
```
- Requires 48 hours to pass
- Rejects premature execution
- Prevents double execution
- Emits `UpgradeExecuted` event

### Management Functions
```rust
pub fn cancel_upgrade(env: Env, owner: Address)              // Owner only
pub fn set_timelock_duration(env: Env, owner: Address, u64)  // Owner only
pub fn get_scheduled_upgrade(env: Env) -> Option<ScheduledUpgrade>
pub fn get_upgrade_timelock_remaining(env: Env) -> u64
pub fn get_timelock_duration(env: Env) -> u64
```

## Integration (2 Steps)

### Step 1: Add Imports
```rust
use crate::upgrade::{UpgradeContract, UpgradeStorage};
use soroban_sdk::BytesN;
```

### Step 2: Add Functions to Contract
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
T+0h:  Admin schedules upgrade → UpgradeScheduled event
       Wait period begins
       
T+48h: Timelock expires
       Admin executes upgrade → UpgradeExecuted event
       New WASM code active

T+48h to T+∞: 
       Next upgrade can be scheduled
```

## Key Properties

| Property | Value |
|----------|-------|
| Default Timelock | 48 hours (172800 seconds) |
| Minimum Wait | Configurable (default 48h) |
| Admin Role | Required to schedule/execute |
| Owner Role | Required to configure/cancel |
| Event Type | Emitted for all state changes |
| Storage | Instance storage (persistent) |
| Execution Cost | ~1,000-2,000 XLM (estimated) |

## Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `"Not an admin"` | Caller lacks Admin role | Use admin account |
| `"Timelock period not yet elapsed"` | Tried to execute early | Wait 48 hours or reduce timelock |
| `"Upgrade already scheduled"` | Already pending upgrade | Cancel existing or wait for execution |
| `"No upgrade scheduled"` | Tried to execute when none scheduled | Schedule upgrade first |
| `"Upgrade already executed"` | Tried to execute twice | Schedule new upgrade |

## Testing

### Run All Tests
```bash
cd /home/nursca/Traqora/contracts
cargo test upgrade_mechanism
```

### Key Tests
```bash
# Verify premature execution is rejected
cargo test test_execute_upgrade_rejects_premature_execution

# Verify execution works after timelock
cargo test test_execute_upgrade_succeeds_after_timelock

# Verify authorization
cargo test test_schedule_upgrade_requires_admin
```

## Events

```
UpgradeScheduled {
  new_wasm_hash: BytesN<32>,
  scheduled_at: u64,
  scheduled_by: Address
}

UpgradeExecuted {
  new_wasm_hash: BytesN<32>,
  executed_at: u64,
  executed_by: Address
}

UpgradeCancelled {
  new_wasm_hash: BytesN<32>,
  cancelled_by: Address
}

TimelockUpdated {
  new_duration: u64,
  updated_by: Address
}
```

## Workflow

### Normal Flow
```
1. Admin calls schedule_upgrade(new_hash)
2. System stores upgrade + timestamp
3. Wait 48 hours (community review)
4. Admin calls execute_upgrade()
5. System verifies 48h passed
6. Contract upgraded
7. Next upgrade can be scheduled
```

### Emergency Flow  
```
1. Owner calls set_timelock_duration(3600)  // 1 hour instead of 48h
2. Admin calls schedule_upgrade(new_hash)
3. Wait 1 hour
4. Admin calls execute_upgrade()
5. Owner calls set_timelock_duration(172800)  // Restore to 48h
```

### Cancellation Flow
```
1. Admin calls schedule_upgrade(new_hash)
2. Owner decides to cancel
3. Owner calls cancel_upgrade()
4. Upgrade removed
5. Can schedule different upgrade
```

## Files

| File | Purpose |
|------|---------|
| `contracts/src/upgrade/lib.rs` | Core implementation |
| `contracts/tests/upgrade_mechanism_test.rs` | Test suite (38 tests) |
| `UPGRADE_MECHANISM.md` | Full API documentation |
| `UPGRADE_IMPLEMENTATION_GUIDE.md` | Integration guide |
| `contracts/src/upgrade/integration_examples.rs` | Code examples |

## Monitoring Checklist

- [ ] Listen for `UpgradeScheduled` events
- [ ] Alert stakeholders of pending upgrades
- [ ] Wait 48 hours minimum
- [ ] Community reviews code changes
- [ ] Listen for `UpgradeExecuted` events
- [ ] Verify contract behavior post-upgrade
- [ ] Document any breaking changes

## Common Questions

**Q: Can I execute an upgrade before 48 hours?**  
A: No. The system will reject with "Timelock period not yet elapsed"

**Q: What if I make a mistake scheduling?**  
A: Owner can call `cancel_upgrade()` to cancel a pending upgrade

**Q: Can I change the 48-hour timelock?**  
A: Yes. Owner calls `set_timelock_duration(duration_in_seconds)`

**Q: Can I upgrade twice in a row?**  
A: Yes. After first upgrade executes, you can schedule another

**Q: Who can execute upgrades?**  
A: Anyone with Admin role (same as who schedules)

**Q: What happens to contract state during upgrade?**  
A: State is preserved. Only WASM code changes.

## Architecture

```
┌─────────────────────────────────────────┐
│       Your Contract                     │
│  ┌────────────────────────────────────┐ │
│  │ Your functions                     │ │
│  ├────────────────────────────────────┤ │
│  │ schedule_upgrade()                 │ │
│  │ execute_upgrade()                  │ │
│  │ get_upgrade_timelock_remaining()   │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│   upgrade::UpgradeContract              │
│  ┌────────────────────────────────────┐ │
│  │ schedule_upgrade()                 │ │
│  │ execute_upgrade()                  │ │
│  │ cancel_upgrade()                   │ │
│  │ set_timelock_duration()            │ │
│  │ get_*()                            │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│   AccessControl                         │
│  ┌────────────────────────────────────┐ │
│  │ require_admin()                    │ │
│  │ require_owner()                    │ │
│  │ has_role()                         │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Security Model

| Component | Protection |
|-----------|-----------|
| Schedule | Admin role + auth check |
| Execute | Admin role + 48h timelock + auth check |
| Configure | Owner role + auth check |
| Cancel | Owner role + auth check |
| State Transition | Prevents double execution + concurrent upgrades |

## Performance

- **Scheduling**: 1 storage write + 1 event (~500 bytes)
- **Execution**: 1 storage update + 1 event (~500 bytes)
- **Query**: 1 storage read (cached if possible)
- **Gas**: 1,000-2,000 XLM per operation (estimate)

## Links

- [Full API Documentation](UPGRADE_MECHANISM.md)
- [Integration Guide](UPGRADE_IMPLEMENTATION_GUIDE.md)
- [Source Code](contracts/src/upgrade/lib.rs)
- [Test Suite](contracts/tests/upgrade_mechanism_test.rs)
- [Examples](contracts/src/upgrade/integration_examples.rs)

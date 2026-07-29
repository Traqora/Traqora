# Contract Upgrade Mechanism with Timelock

## Overview

This document describes the contract upgrade mechanism with a 48-hour timelock protection. It provides a safe path for upgrading smart contracts on Soroban, protecting against rushed or malicious upgrades.

## Features

- **Admin-Only Scheduling**: Only administrators can schedule contract upgrades
- **48-Hour Timelock**: Mandatory waiting period before upgrades can be executed
- **Configurable Timelock**: Owner can adjust timelock duration for different security profiles
- **Event Emission**: Emits events for scheduling, execution, and cancellation
- **Execution Validation**: Prevents premature execution and double execution
- **State Inspection**: Read-only methods to check upgrade status and remaining timelock

## Architecture

### Data Structures

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct ScheduledUpgrade {
    pub new_wasm_hash: BytesN<32>,    // Hash of new WASM bytecode
    pub scheduled_at: u64,             // Timestamp when upgrade was scheduled
    pub executed: bool,                // Whether upgrade has been executed
}
```

### Storage

Uses Soroban's instance storage for timelock-related data:
- `ScheduledUpgrade`: The current scheduled upgrade (if any)
- `UpgradeTimelock`: Custom timelock duration (default: 172800 seconds = 48 hours)

## API Reference

### Admin Functions

#### `schedule_upgrade(admin: Address, new_wasm_hash: BytesN<32>)`

Schedules a new contract upgrade to be executed after the timelock period.

**Requirements**:
- Caller must have Admin role
- No pending/unexecuted upgrade can be scheduled
- WASM hash must be provided

**Events**:
- `UpgradeScheduled` - Contains: new_wasm_hash, scheduled_at, scheduled_by

**Example**:
```rust
let new_hash = BytesN::from_array(&env, &[/*32 bytes*/]);
UpgradeContract::schedule_upgrade(env, admin, new_hash);
```

#### `execute_upgrade(admin: Address)`

Executes a scheduled upgrade after the timelock has elapsed.

**Requirements**:
- Caller must have Admin role
- An upgrade must be scheduled
- 48 hours (or custom timelock) must have passed since scheduling
- Upgrade must not have been previously executed

**Events**:
- `UpgradeExecuted` - Contains: new_wasm_hash, executed_at, executed_by

**Reverts if**:
- `"No upgrade scheduled"` - No upgrade is currently scheduled
- `"Timelock period not yet elapsed"` - Not enough time has passed
- `"Upgrade already executed"` - Upgrade was already executed

**Example**:
```rust
UpgradeContract::execute_upgrade(env, admin);
```

#### `cancel_upgrade(owner: Address)`

Cancels a pending upgrade before it's executed.

**Requirements**:
- Caller must be the Owner

**Events**:
- `UpgradeCancelled` - Contains: new_wasm_hash, cancelled_by

**Reverts if**:
- `"Cannot cancel an executed upgrade"` - Upgrade is already executed

**Example**:
```rust
UpgradeContract::cancel_upgrade(env, owner);
```

### Owner Functions

#### `set_timelock_duration(owner: Address, duration: u64)`

Sets a custom timelock duration in seconds.

**Requirements**:
- Caller must be the Owner
- Duration must be > 0

**Events**:
- `TimelockUpdated` - Contains: new_duration, updated_by

**Default**: 172800 seconds (48 hours)

**Example**:
```rust
// Set 24-hour timelock
UpgradeContract::set_timelock_duration(env, owner, 86400);
```

### Read-Only Functions

#### `get_scheduled_upgrade() -> Option<ScheduledUpgrade>`

Returns the currently scheduled upgrade, if any.

**Returns**: Option with ScheduledUpgrade data or None

**Example**:
```rust
let upgrade = UpgradeContract::get_scheduled_upgrade(env);
match upgrade {
    Some(u) => println!("Scheduled: {:?}", u.new_wasm_hash),
    None => println!("No upgrade scheduled"),
}
```

#### `get_timelock_duration() -> u64`

Returns the current timelock duration in seconds.

**Example**:
```rust
let duration = UpgradeContract::get_timelock_duration(env);
println!("Timelock: {} seconds", duration);
```

#### `get_upgrade_timelock_remaining() -> u64`

Returns seconds until scheduled upgrade can be executed.

**Returns**:
- 0 if no upgrade is scheduled
- 0 if timelock has already elapsed
- Remaining seconds otherwise

**Example**:
```rust
let remaining = UpgradeContract::get_upgrade_timelock_remaining(env);
if remaining > 0 {
    println!("Wait {} more seconds", remaining);
} else {
    println!("Ready to execute!");
}
```

## Integration Guide

### Adding Upgrade Mechanism to Your Contract

1. **Import the upgrade module** in your contract:

```rust
use traqora_contracts::upgrade::{
    UpgradeContract, 
    UpgradeStorage, 
    ScheduledUpgrade
};
```

2. **Add upgrade functions** to your contract implementation:

```rust
#[contractimpl]
pub struct MyContract;

impl MyContract {
    pub fn schedule_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        UpgradeContract::schedule_upgrade(env, admin, new_wasm_hash)
    }

    pub fn execute_upgrade(env: Env, admin: Address) {
        UpgradeContract::execute_upgrade(env, admin)
    }

    pub fn get_scheduled_upgrade(env: Env) -> Option<ScheduledUpgrade> {
        UpgradeContract::get_scheduled_upgrade(env)
    }

    pub fn get_upgrade_timelock_remaining(env: Env) -> u64 {
        UpgradeContract::get_upgrade_timelock_remaining(env)
    }

    // ... other contract methods
}
```

3. **The upgrade mechanism is now available**:
   - Admins can schedule upgrades
   - Upgrades are protected by 48-hour timelock by default
   - Owners can adjust timelock or cancel pending upgrades

## Security Considerations

### Timelock Protection

- **Minimum Wait**: 48 hours (172800 seconds) by default
- **Customizable**: Owners can adjust for different threat models
- **Prevents**: Flash upgrades, malicious code injection without notice

### Access Control

- **Schedule**: Admin role required
- **Execute**: Admin role required
- **Configure**: Owner only (highest privilege)
- **Cancel**: Owner only

### Immutability After Execution

- Once executed, an upgrade cannot be re-executed
- A new upgrade must be scheduled for subsequent changes

## Testing

### Premature Execution Prevention

The test suite includes comprehensive tests for rejecting premature execution:

```rust
#[test]
#[should_panic(expected = "Timelock period not yet elapsed")]
fn test_execute_upgrade_rejects_premature_execution() {
    // Schedule at T0
    // Try execute at T0 + 1 second
    // Should panic with "Timelock period not yet elapsed"
}
```

### Run Tests

```bash
cargo test --manifest-path contracts/Cargo.toml upgrade_mechanism
```

### Test Coverage

The test suite covers:
- ✅ Basic scheduling and retrieval
- ✅ Authorization checks (admin/owner only)
- ✅ Timelock enforcement (premature execution prevention)
- ✅ Boundary conditions (exactly 48 hours)
- ✅ Multiple upgrades (sequential)
- ✅ Cancellation scenarios
- ✅ Custom timelock durations
- ✅ Remaining time calculations
- ✅ Double-execution prevention
- ✅ State transitions

## Events

### UpgradeScheduled

Emitted when a new upgrade is scheduled.

```
Topic 0: ("upgrade", "scheduled")
Data: (new_wasm_hash, scheduled_at, scheduled_by)
```

### UpgradeExecuted

Emitted when a scheduled upgrade is executed.

```
Topic 0: ("upgrade", "executed")
Data: (new_wasm_hash, executed_at, executed_by)
```

### UpgradeCancelled

Emitted when a pending upgrade is cancelled.

```
Topic 0: ("upgrade", "cancelled")
Data: (new_wasm_hash, cancelled_by)
```

### TimelockUpdated

Emitted when timelock duration is changed.

```
Topic 0: ("upgrade", "timelock_updated")
Data: (new_duration, updated_by)
```

## Best Practices

### 1. Monitor Events

Off-chain monitoring should track upgrade events:
- Listen for `UpgradeScheduled` to alert stakeholders
- Verify `UpgradeExecuted` after execution
- Alert on suspicious `UpgradeCancelled` events

### 2. Governance Integration

Combine with governance system for voting:
- Governance votes on upgrade WASM hashes
- Governance execution triggers schedule_upgrade
- Governance committee executes after timelock

### 3. Gradual Rollout

For large upgrades:
1. Announce scheduled upgrade (community discussion)
2. Wait 48+ hours for community review
3. Execute only if no critical issues found
4. Have rollback plan ready

### 4. Testing

Always test upgrades in staging:
- Test new WASM code in testnet
- Verify state migration logic
- Document any breaking changes

## Example: Complete Workflow

```rust
// Day 0: 14:00 UTC
// Admin schedules new upgrade
let new_wasm = get_new_wasm_hash();
UpgradeContract::schedule_upgrade(env, admin, new_wasm);
// UpgradeScheduled event emitted

// Day 0: 14:00 UTC -> Day 2: 14:00 UTC
// 48-hour wait period
// Community reviews code
// Monitoring systems alert stakeholders

// Day 2: 14:00 UTC (exactly 48 hours later)
// Admin executes upgrade
UpgradeContract::execute_upgrade(env, admin);
// UpgradeExecuted event emitted
// Contract upgraded with new WASM code

// Day 2: After execution
// Admin can schedule next upgrade if needed
UpgradeContract::schedule_upgrade(env, admin, next_wasm);
```

## Troubleshooting

### "Timelock period not yet elapsed"

**Cause**: Trying to execute before 48 hours have passed

**Solution**: 
- Wait for timelock to expire
- Or reduce timelock: `set_timelock_duration(env, owner, shorter_time)`
- Or cancel and reschedule with adjusted time

### "Upgrade already scheduled and pending execution"

**Cause**: Trying to schedule while another upgrade is pending

**Solution**:
- Wait for existing upgrade to execute, or
- Cancel existing upgrade: `cancel_upgrade(env, owner)`
- Then schedule new upgrade

### "Not an admin"

**Cause**: Caller doesn't have Admin role

**Solution**:
- Use proper admin account
- Or grant Admin role via access control: `AccessControl::set_role(..., Role::Admin, true)`

## Version History

- **v1.0.0**: Initial release with 48-hour timelock
  - schedule_upgrade function
  - execute_upgrade function
  - Configurable timelock
  - Full test coverage

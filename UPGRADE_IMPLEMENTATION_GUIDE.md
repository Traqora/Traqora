# Contract Upgrade Mechanism - Implementation Guide

## Quick Start

The upgrade mechanism is already implemented in `/contracts/src/upgrade/lib.rs` and is ready to be integrated into any Soroban contract in the Traqora ecosystem.

## Files Created

### Core Implementation
- **`/contracts/src/upgrade/lib.rs`** - Main upgrade mechanism module
- **`/contracts/src/upgrade/integration_examples.rs`** - Integration examples and patterns
- **`/contracts/tests/upgrade_mechanism_test.rs`** - Comprehensive test suite (38 test cases)

### Documentation
- **`/UPGRADE_MECHANISM.md`** - Complete API reference and best practices
- **`IMPLEMENTATION_GUIDE.md`** - This file

## Integration Steps

### Step 1: Import the Upgrade Module

The upgrade module is already exposed in the main library. Verify in `/contracts/src/lib.rs`:

```rust
#[path = "upgrade/lib.rs"]
pub mod upgrade;
```

### Step 2: Add Upgrade Functions to Your Contract

For each contract you want to make upgradeable, add these functions to the `#[contractimpl]` block:

```rust
use soroban_sdk::{Address, BytesN, Env};
use crate::upgrade::{UpgradeContract, UpgradeStorage, ScheduledUpgrade};

#[contractimpl]
impl MyContract {
    // ... existing contract functions ...

    // ===== UPGRADE FUNCTIONS =====
    
    /// Schedule a contract upgrade (admin only)
    pub fn schedule_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        UpgradeContract::schedule_upgrade(env, admin, new_wasm_hash);
    }

    /// Execute a scheduled upgrade after timelock (admin only)
    pub fn execute_upgrade(env: Env, admin: Address) {
        UpgradeContract::execute_upgrade(env, admin);
    }

    /// Cancel a pending upgrade (owner only)
    pub fn cancel_upgrade(env: Env, owner: Address) {
        UpgradeContract::cancel_upgrade(env, owner);
    }

    /// Set custom timelock duration in seconds (owner only)
    pub fn set_timelock_duration(env: Env, owner: Address, duration: u64) {
        UpgradeContract::set_timelock_duration(env, owner, duration);
    }

    // ===== READ-ONLY FUNCTIONS =====

    /// Get currently scheduled upgrade (if any)
    pub fn get_scheduled_upgrade(env: Env) -> Option<ScheduledUpgrade> {
        UpgradeContract::get_scheduled_upgrade(env)
    }

    /// Get current timelock duration in seconds
    pub fn get_timelock_duration(env: Env) -> u64 {
        UpgradeContract::get_timelock_duration(env)
    }

    /// Get seconds remaining until upgrade can be executed
    pub fn get_upgrade_timelock_remaining(env: Env) -> u64 {
        UpgradeContract::get_upgrade_timelock_remaining(env)
    }
}
```

### Step 3: Example - Token Contract

Here's how to add upgrade capability to the TRQ token contract:

**File: `/contracts/src/token/lib.rs`**

```rust
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, BytesN,
};
use crate::access::{AccessControl, Role};
use crate::upgrade::{UpgradeContract, UpgradeStorage, ScheduledUpgrade};  // ADD THIS

// ... existing TokenMetadata, Allowance, TokenStorage ...

#[contract]
pub struct TRQTokenContract;

#[contractimpl]
impl TRQTokenContract {
    // ... existing token functions (init_token, mint, transfer, etc.) ...

    // ===== NEW: UPGRADE FUNCTIONS =====

    pub fn schedule_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        UpgradeContract::schedule_upgrade(env, admin, new_wasm_hash);
    }

    pub fn execute_upgrade(env: Env, admin: Address) {
        UpgradeContract::execute_upgrade(env, admin);
    }

    pub fn cancel_upgrade(env: Env, owner: Address) {
        UpgradeContract::cancel_upgrade(env, owner);
    }

    pub fn set_timelock_duration(env: Env, owner: Address, duration: u64) {
        UpgradeContract::set_timelock_duration(env, owner, duration);
    }

    pub fn get_scheduled_upgrade(env: Env) -> Option<ScheduledUpgrade> {
        UpgradeContract::get_scheduled_upgrade(env)
    }

    pub fn get_timelock_duration(env: Env) -> u64 {
        UpgradeContract::get_timelock_duration(env)
    }

    pub fn get_upgrade_timelock_remaining(env: Env) -> u64 {
        UpgradeContract::get_upgrade_timelock_remaining(env)
    }
}
```

### Step 4: Testing

The upgrade mechanism has a comprehensive test suite with 38 test cases covering:

**Run all upgrade tests:**
```bash
cd contracts
cargo test upgrade_mechanism -- --nocapture
```

**Run specific test categories:**
```bash
# Core functionality
cargo test upgrade_mechanism_tests::test_schedule_upgrade_basic

# Authorization checks
cargo test upgrade_mechanism_tests::test_schedule_upgrade_requires_admin

# Timelock validation
cargo test upgrade_mechanism_tests::test_execute_upgrade_rejects_premature_execution

# State management
cargo test upgrade_mechanism_tests::test_cannot_schedule_multiple_pending_upgrades

# Full flow
cargo test upgrade_mechanism_tests::test_upgrade_flow_complete_scenario
```

## Test Coverage

### Core Functionality (4 tests)
- ✅ `test_schedule_upgrade_basic` - Basic scheduling works
- ✅ `test_schedule_upgrade_stores_timestamp` - Timestamp is recorded
- ✅ `test_get_scheduled_upgrade_read_only` - Read-only access works
- ✅ `test_execute_upgrade_success_after_timelock` - Execution succeeds after timelock

### Authorization (4 tests)
- ✅ `test_schedule_upgrade_requires_admin` - Only admin can schedule
- ✅ `test_execute_upgrade_requires_admin` - Only admin can execute
- ✅ `test_set_timelock_requires_owner` - Only owner can set timelock
- ✅ `test_cancel_upgrade_requires_owner` - Only owner can cancel

### Timelock Validation (4 tests)
- ✅ `test_execute_upgrade_rejects_premature_execution` - Rejects early execution ⭐
- ✅ `test_execute_upgrade_succeeds_at_exact_timelock_boundary` - Exact boundary works
- ✅ `test_execute_upgrade_succeeds_after_timelock` - Post-timelock works
- ✅ `test_cannot_set_zero_timelock` - Prevents invalid duration

### Upgrade State Management (4 tests)
- ✅ `test_execute_upgrade_with_no_scheduled_upgrade` - Rejects when none scheduled
- ✅ `test_execute_upgrade_cannot_execute_twice` - Prevents double execution
- ✅ `test_cannot_schedule_multiple_pending_upgrades` - Prevents concurrent upgrades
- ✅ `test_can_schedule_upgrade_after_previous_executed` - Allows sequential upgrades

### Timelock Duration (3 tests)
- ✅ `test_default_timelock_is_48_hours` - Default is 172800 seconds
- ✅ `test_set_custom_timelock_duration` - Custom duration works
- ✅ `test_execute_upgrade_uses_custom_timelock` - Custom duration is enforced

### Remaining Time Calculation (4 tests)
- ✅ `test_get_upgrade_timelock_remaining_no_upgrade` - Returns 0 if none scheduled
- ✅ `test_get_upgrade_timelock_remaining_early_stage` - Correct remainder calculation
- ✅ `test_get_upgrade_timelock_remaining_after_expiry` - Returns 0 after expiry
- ✅ `test_get_upgrade_timelock_remaining_after_execution` - Returns 0 after execution

### Cancellation (2 tests)
- ✅ `test_cancel_upgrade_clears_scheduled_upgrade` - Cancellation works
- ✅ `test_cannot_cancel_executed_upgrade` - Prevents canceling executed upgrades

### Integration/Edge Cases (3 tests)
- ✅ `test_upgrade_flow_complete_scenario` - Full workflow works
- ✅ `test_multiple_sequential_upgrades` - Multiple upgrades sequence correctly
- ✅ `test_cancel_and_reschedule` - Cancel and reschedule works

## Key Features

### 1. **48-Hour Timelock (Default)**
All upgrades require a 48-hour waiting period by default.

```rust
// Schedule upgrade
let new_hash = BytesN::from_array(&env, &[/*...*/]);
UpgradeContract::schedule_upgrade(env.clone(), admin.clone(), new_hash);

// Must wait 48 hours (172800 seconds) before execution
env.ledger().set_timestamp(env.ledger().timestamp() + 172800);

// Now execution succeeds
UpgradeContract::execute_upgrade(env, admin);
```

### 2. **Configurable Timelock**
Owners can adjust timelock for different security profiles.

```rust
// Emergency scenario: reduce timelock to 1 hour
UpgradeContract::set_timelock_duration(env, owner, 3600);

// Critical security: increase timelock to 7 days
UpgradeContract::set_timelock_duration(env, owner, 604800);
```

### 3. **Premature Execution Prevention** ⭐
The system rejects execution attempts before timelock elapses.

```rust
// Schedule upgrade at time T
env.ledger().set_timestamp(1000);
UpgradeContract::schedule_upgrade(env.clone(), admin.clone(), hash);

// Try to execute 1 second later - FAILS
env.ledger().set_timestamp(1001);
UpgradeContract::execute_upgrade(env.clone(), admin.clone());  // Panics: "Timelock period not yet elapsed"
```

### 4. **Double-Execution Prevention**
Once an upgrade is executed, it cannot be executed again.

```rust
UpgradeContract::execute_upgrade(env.clone(), admin.clone());
UpgradeContract::execute_upgrade(env, admin);  // Panics: "Upgrade already executed"
```

### 5. **Event Emission**
All state changes emit events for monitoring.

```
Events emitted:
- UpgradeScheduled(new_wasm_hash, scheduled_at, scheduled_by)
- UpgradeExecuted(new_wasm_hash, executed_at, executed_by)
- UpgradeCancelled(new_wasm_hash, cancelled_by)
- TimelockUpdated(new_duration, updated_by)
```

## Security Properties

### Access Control
```
schedule_upgrade() → Admin role required
execute_upgrade()  → Admin role required
cancel_upgrade()   → Owner only
set_timelock()     → Owner only
get_*()            → Public (read-only)
```

### Timelock Guarantees
- Minimum wait: 48 hours by default (172800 seconds)
- Configurable by owner for different scenarios
- Enforced at execution time
- Prevents flash upgrades and malicious code injection

### State Integrity
- Only one upgrade can be pending at a time
- Executed upgrades cannot be re-executed
- Previous upgrades can be scheduled after execution
- Cancellation only works on pending upgrades

## Common Integration Patterns

### Pattern 1: Minimal Integration
Add upgrade functions to existing contract:

```rust
pub fn schedule_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
    UpgradeContract::schedule_upgrade(env, admin, new_wasm_hash);
}

pub fn execute_upgrade(env: Env, admin: Address) {
    UpgradeContract::execute_upgrade(env, admin);
}
```

### Pattern 2: Governance-Controlled Upgrades
DAO proposes and votes on upgrades:

```rust
pub fn dao_propose_upgrade(env: Env, proposer: Address, new_hash: BytesN<32>) {
    // Verify proposer has voting power
    // Create governance proposal
    // Start voting period
}

pub fn dao_execute_upgrade(env: Env, proposal_id: u64) {
    // Verify proposal passed
    // Verify voting ended
    UpgradeContract::schedule_upgrade(env, admin, new_hash);
}

pub fn finalize_upgrade_after_timelock(env: Env, admin: Address) {
    // Check timelock passed
    UpgradeContract::execute_upgrade(env, admin);
}
```

### Pattern 3: Multi-Stage Validation
Validate upgrade before scheduling:

```rust
pub fn schedule_validated_upgrade(
    env: Env,
    admin: Address,
    new_hash: BytesN<32>,
    new_version: u32,
) {
    // Verify compatibility
    assert!(is_compatible(&env, new_version), "Incompatible version");
    
    // Schedule upgrade
    UpgradeContract::schedule_upgrade(env, admin, new_hash);
}
```

## Monitoring and Operations

### 1. **Event Monitoring**
Listen for upgrade events:

```typescript
// JavaScript example
contract.events.on('UpgradeScheduled', (event) => {
  console.log('Upgrade scheduled:', event.new_wasm_hash);
  console.log('Scheduled at:', new Date(event.scheduled_at * 1000));
  console.log('By:', event.scheduled_by);
  
  // Alert stakeholders
  notifySlack(`Upgrade scheduled: ${event.new_wasm_hash}`);
});

contract.events.on('UpgradeExecuted', (event) => {
  console.log('Upgrade executed:', event.new_wasm_hash);
  notifySlack(`Upgrade executed: ${event.new_wasm_hash}`);
});
```

### 2. **Status Checking**
Query upgrade status anytime:

```rust
// Check if upgrade pending
let upgrade = contract.get_scheduled_upgrade();
match upgrade {
    Some(u) => println!("Pending upgrade: {:?}", u.new_wasm_hash),
    None => println!("No upgrades scheduled"),
}

// Check time remaining
let remaining = contract.get_upgrade_timelock_remaining();
println!("Time remaining: {} seconds", remaining);
```

### 3. **Health Checks**
Verify upgrade mechanism health:

```rust
pub fn verify_upgrade_health(env: &Env) -> bool {
    // Check timelock is reasonable
    let timelock = UpgradeContract::get_timelock_duration(env.clone());
    assert!(timelock > 3600 && timelock < 2592000, "Timelock out of range");
    
    // Check no stuck upgrades
    if let Some(u) = UpgradeContract::get_scheduled_upgrade(env.clone()) {
        let age = env.ledger().timestamp() - u.scheduled_at;
        assert!(age < 2592000, "Upgrade scheduled too long ago");
    }
    
    true
}
```

## Troubleshooting

### Issue: "Timelock period not yet elapsed"
**Cause**: Trying to execute before 48 hours have passed

**Solution**:
1. Wait for timelock to expire, or
2. Reduce timelock: `set_timelock_duration(env, owner, shorter_duration)`, or
3. Cancel and reschedule with adjusted time

### Issue: "Upgrade already scheduled and pending execution"
**Cause**: Trying to schedule while another upgrade is pending

**Solution**:
1. Wait for existing upgrade to execute, or
2. Cancel existing upgrade: `cancel_upgrade(env, owner)`, then schedule new one

### Issue: "Not an admin"
**Cause**: Caller doesn't have Admin role

**Solution**:
1. Use proper admin account, or
2. Grant Admin role: `AccessControl::set_role(&env, &admin, &address, Role::Admin, true)`

## Version Information

- **Implementation Version**: 1.0.0
- **Default Timelock**: 48 hours (172800 seconds)
- **Minimum Timelock**: 1 second (can be configured)
- **Maximum WASM Hash**: 32 bytes (256 bits)
- **Supported Soroban SDK**: 22.0.0

## Next Steps

1. **Review** the upgrade mechanism: [UPGRADE_MECHANISM.md](../UPGRADE_MECHANISM.md)
2. **Run tests** to verify functionality: `cargo test upgrade_mechanism`
3. **Integrate** into your contracts using examples in this guide
4. **Deploy** to testnet and verify events
5. **Document** upgrade procedures for your DAO/governance

## References

- [Soroban Upgrade Pattern](https://soroban.stellar.org/docs/learn/storing-data#instance-data-lifecycle)
- [Complete API Documentation](../UPGRADE_MECHANISM.md)
- [Integration Examples](src/upgrade/integration_examples.rs)
- [Test Suite](tests/upgrade_mechanism_test.rs)

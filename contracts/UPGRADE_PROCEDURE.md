# Contract Upgrade Procedure with 48-Hour Timelock

## Overview

All upgradeable Traqora contracts use a **48-hour timelock mechanism** to ensure security and governance oversight. This document describes the complete upgrade lifecycle: proposal, approval, execution, and rollback.

## Upgrade Timelock Details

- **Timelock Duration**: 48 hours (172,800 seconds)
- **Enforcement**: Hard-coded in `contracts/src/upgrade_timelock/lib.rs`
- **Guarantee**: Execution cannot occur before the timelock expires
- **Enforcement Point**: `execute_upgrade` checks `env.ledger().timestamp() >= proposal.execute_after`

## Upgrade Procedure

### Phase 1: Schedule/Propose Upgrade

**Preconditions:**
- Caller must be an authorized signer in the proxy contract
- Contract must be initialized and in `Active` state
- No other upgrade for the same proposal may be in flight

**Action:**
```rust
let proposal_id = proxy_client.schedule_upgrade(
    &proposer,
    &new_implementation_hash,
    &Some(new_storage_version),
);
```

**Parameters:**
- `proposer`: Address proposing the upgrade (must be signer)
- `new_implementation_hash`: 32-byte hash of new implementation code
- `new_storage_version`: Optional storage version for data migration

**Events Emitted:**
```
(upgrade, scheduled): (proposal_id, new_implementation, execute_after_timestamp)
```

**State Changes:**
- New `UpgradeProposal` record created with `executed: false`, `rolled_back: false`
- Proposer is automatically counted as approver
- `execute_after` set to current ledger timestamp + 48 hours
- Proposal count incremented

### Phase 2: Gather Approvals

**Preconditions:**
- Upgrade proposal exists
- Caller is an authorized signer
- Proposal has not expired
- Caller has not already approved

**Action:**
```rust
proxy_client.approve_upgrade(&signer, &proposal_id);
```

**Repeat** until threshold is reached (default 2 of 3 signers).

**Events Emitted:**
```
(upgrade, approved): (proposal_id, signer)
```

**State Changes:**
- Signer added to `proposal.approvals` list
- Approval recorded in persistent storage

### Phase 3: Wait for Timelock Expiration

**During the 48-hour window:**
- Proposal cannot be executed
- Attempting to execute will panic: `"Upgrade timelock active"`
- Proposal can still be approved by additional signers
- Rollback is not yet available (upgrade not executed)

**After 48 hours:**
- Timelock is satisfied
- Execution becomes available

### Phase 4: Execute Upgrade

**Preconditions:**
- Proposal exists and has not been executed
- Threshold of approvals received (e.g., 2 of 3)
- 48-hour timelock has expired
- Contract state is `Active`

**Action:**
```rust
proxy_client.execute_upgrade(&executor, &proposal_id);
// Alias: proxy_client.upgrade_to(&executor, &proposal_id);
```

**Flow:**
1. Set contract state to `Upgrading` (prevents concurrent operations)
2. Update `config.implementation` to new implementation hash
3. Increment `config.version`
4. If `new_storage_version` provided, record migration metadata
5. Mark proposal as `executed: true`
6. Restore contract state to `Active`
7. Emit event with new version and implementation hashes

**Events Emitted:**
```
(upgrade, executed): (proposal_id, new_version, old_implementation, new_implementation)
```

**State Changes:**
- `UpgradeProposal.executed` set to `true`
- `ProxyConfig.implementation` updated
- `ProxyConfig.version` incremented
- `ProxyConfig.storage_version` updated if migration specified
- Contract transitions through `Upgrading` → `Active` states

## Rollback Procedure

### When to Rollback

Rollback should be initiated immediately if:
- New implementation has critical bugs
- Data migration failed or corrupted state
- Performance degradation or unexpected behavior
- Security vulnerability discovered in new code

### Rollback Steps

**Preconditions:**
- Upgrade has been executed
- Rollback has not yet occurred
- Caller is an authorized signer

**Action:**
```rust
proxy_client.rollback_upgrade(&executor, &proposal_id);
```

**Flow:**
1. Retrieve executed proposal
2. Verify upgrade was executed and not already rolled back
3. Set contract state to `Upgrading`
4. Restore all fields from proposal backup:
   - `config.implementation` → `proposal.previous_implementation`
   - `config.version` → `proposal.previous_version`
   - `config.storage_version` → `proposal.previous_storage_version`
5. Restore contract state to `Active`
6. Mark proposal as `rolled_back: true`
7. Emit event with previous and restored implementation hashes

**Events Emitted:**
```
(upgrade, rolled_back): (proposal_id, current_implementation, restored_implementation)
```

**State Changes:**
- `UpgradeProposal.rolled_back` set to `true`
- All config fields restored to previous values
- Version counter restored

## Complete Workflow Example

### Scenario: Airline Contract Upgrade

**Timeline:**
- **T+0:00** Monday 2pm: Propose upgrade
- **T+48:00** Wednesday 2pm: Timelock expires, execute upgrade
- **T+48:30** Wednesday 2:30pm: Bug detected, initiate rollback

**Step-by-step:**

```rust
// MONDAY 2:00 PM - PHASE 1: PROPOSE
let new_implementation = BytesN::from_array(&env, &new_code_hash);
let proposal_id = airline_client.schedule_upgrade(
    &signer1,
    &new_implementation,
    &Some(2),  // new storage version
);
// Event: (upgrade, scheduled): (1, new_impl_hash, wednesday_2pm_timestamp)

// MONDAY 3:00 PM - PHASE 2: APPROVE
airline_client.approve_upgrade(&signer2, &proposal_id);
// Event: (upgrade, approved): (1, signer2)

// WEDNESDAY 2:00 PM - PHASE 3: WAIT COMPLETE
// Ledger timestamp now equals or exceeds wednesday_2pm_timestamp
// Execution now available

// WEDNESDAY 2:15 PM - PHASE 4: EXECUTE
airline_client.upgrade_to(&signer1, &proposal_id);
// Event: (upgrade, executed): (1, 2, old_impl_hash, new_impl_hash)

// WEDNESDAY 2:30 PM - PHASE 5: DETECT BUG, ROLLBACK
airline_client.rollback_upgrade(&signer2, &proposal_id);
// Event: (upgrade, rolled_back): (1, new_impl_hash, old_impl_hash)
// Contract now runs old implementation again
```

## Data Structures

### UpgradeProposal
```rust
pub struct UpgradeProposal {
    pub proposal_id: u64,
    pub new_implementation: BytesN<32>,
    pub new_storage_version: Option<u32>,
    pub proposed_at: u64,
    pub scheduled_at: u64,
    pub execute_after: u64,  // Current time + 48 hours
    pub previous_implementation: BytesN<32>,
    pub previous_storage_version: u32,
    pub previous_version: u32,
    pub approvals: Vec<Address>,
    pub executed: bool,
    pub rolled_back: bool,
}
```

### ProxyConfig
```rust
pub struct ProxyConfig {
    pub admin: Address,
    pub implementation: BytesN<32>,
    pub state: ProxyState,
    pub version: u32,
    pub storage_version: u32,
}

pub enum ProxyState {
    Active,
    Upgrading,
    Paused,
}
```

## Integration Points

### All Deployable Contracts

Each contract initializes upgrade owner in its entrypoint:

```rust
pub fn initialize(env: Env, owner: Address) {
    // ... contract-specific init ...
    crate::upgrade_timelock::UpgradeTimelock::init_upgrade_owner(&env, &owner);
}
```

Contracts with `init_upgrade_owner`:
- `token`
- `booking`
- `flight_registry`
- `airline`
- `refund`
- `refund_automation`
- `oracle`
- `dispute`
- `governance`
- `admin`
- `booking_receipt`
- `dispute_resolution`
- `flight_booking`
- `loyalty`

### Governance Integration (Future)

```rust
// Proposed: Governance votes on upgrade proposals
let proposal_id = governance_client.create_upgrade_proposal(
    &proposer,
    &new_implementation,
    &reasoning_uri,  // IPFS hash of upgrade reasoning
);

// Token holders vote
governance_client.cast_vote(&voter, &proposal_id, &true);  // approve

// If vote passes, can then propose in proxy
let upgrade_id = proxy_client.schedule_upgrade(
    &governance_contract,
    &new_implementation,
    &None,
);
```

## Testing

### Test Coverage

1. **`test_schedule_upgrade_creates_record`**
   - Verifies proposal created with correct fields
   - Validates execute_after timestamp

2. **`test_upgrade_timelock_enforced_before_execution`**
   - Confirms execution fails before 48h
   - Confirms execution succeeds after 48h
   - Verifies ledger timestamp advancement

3. **`test_upgrade_rollback_restores_previous_version`**
   - Confirms rollback restores implementation
   - Confirms rollback restores version
   - Confirms rollback restores storage version

4. **`test_upgrade_events_emitted`**
   - Validates `UpgradeScheduled` event
   - Validates `UpgradeExecuted` event
   - Validates `UpgradeRolledBack` event

5. **`test_multiple_proposals_independent`**
   - Confirms multiple proposals tracked separately
   - Confirms approvals don't cross-contaminate
   - Confirms execution is atomic per proposal

### Running Tests

```bash
cd contracts

# All proxy upgrade tests
cargo test proxy_test

# Specific tests
cargo test test_upgrade_timelock_enforced_before_execution
cargo test test_upgrade_rollback_restores_previous_version

# With output
cargo test proxy_test -- --nocapture
```

## Security Considerations

### Threat: Premature Execution
**Mitigation:** Hard-coded 48-hour timelock enforced at execution time
- Allows for detection and response to security issues
- External parties can audit the new code before it goes live

### Threat: Unauthorized Upgrade
**Mitigation:** Multisig approval requirement
- Minimum 2 signers required by default
- Configurable threshold
- All signers must be explicitly listed

### Threat: Lost Previous Version
**Mitigation:** Complete state backup in proposal
- `previous_implementation`, `previous_version`, `previous_storage_version` stored
- Allows rollback to exact prior state
- No data loss during rollback

### Threat: Concurrent Upgrades
**Mitigation:** State machine with `Upgrading` state
- Contract transitions to `Upgrading` during execution
- Prevents concurrent operations
- Atomic state transitions

### Threat: Double-Rollback
**Mitigation:** Rollback flag tracking
- Each proposal has `rolled_back: bool` flag
- Prevents rolling back the same upgrade twice

## Operational Procedures

### Pre-Upgrade Checklist

- [ ] New implementation code reviewed by 2+ security reviewers
- [ ] Contract storage version incremented if data changes
- [ ] Storage migration logic tested
- [ ] New code deployed to testnet
- [ ] Full regression test suite passes
- [ ] Load testing completed
- [ ] Rollback procedure documented
- [ ] Incident response plan prepared
- [ ] Scheduled maintenance window announced

### Execution Checklist

- [ ] Confirm 48-hour timelock has expired
- [ ] Verify all approvals obtained
- [ ] Re-verify new implementation hash
- [ ] Check contract is in `Active` state
- [ ] Execute upgrade
- [ ] Verify `UpgradeExecuted` event
- [ ] Confirm new version in `get_version()` query
- [ ] Monitor application logs for errors

### Post-Upgrade Monitoring

- [ ] Application metrics normal (latency, error rates)
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Canary tests (small transaction sample) successful
- [ ] Full traffic load monitored
- [ ] 24-hour stability window completed

### Rollback Checklist

- [ ] Issue severity confirmed critical
- [ ] Rollback approved by signers
- [ ] Rollback executed
- [ ] Verify `UpgradeRolledBack` event
- [ ] Confirm previous version in `get_version()` query
- [ ] Application metrics restored
- [ ] Post-incident review scheduled

## Events Reference

All upgrade events are emitted to the Soroban contract event log:

| Event | Topics | Data | Description |
|-------|--------|------|-------------|
| `UpgradeScheduled` | `(upgrade, scheduled)` | `(proposal_id, new_implementation, execute_after)` | Upgrade scheduled with 48h delay |
| `UpgradeExecuted` | `(upgrade, executed)` | `(proposal_id, new_version, old_impl, new_impl)` | Upgrade executed successfully |
| `UpgradeRolledBack` | `(upgrade, rolled_back)` | `(proposal_id, current_impl, restored_impl)` | Upgrade rolled back to previous version |

## Queries

### Get Active Proposals

```rust
pub fn get_upgrade_proposal(env: Env, proposal_id: u64) -> Option<UpgradeProposal>
```

Returns full proposal details including timelock expiration time.

### Get Current Implementation

```rust
pub fn get_implementation(env: Env) -> BytesN<32>
```

Returns currently active implementation hash.

### Get Contract Version

```rust
pub fn get_version(env: Env) -> u32
```

Returns current contract version (incremented on each upgrade).

### Get Multisig Approvals

```rust
pub fn has_approved(env: Env, proposal_id: u64, signer: &Address) -> bool
```

Checks if signer has approved proposal.

## Troubleshooting

### Execution Fails: "Upgrade timelock active"
- 48 hours have not yet elapsed since proposal
- Check proposal's `execute_after` timestamp
- Advance ledger time in testnet (only)

### Execution Fails: "Insufficient approvals"
- Not enough signers have approved yet
- Get additional signer approvals via `approve_upgrade`
- Check current approval count

### Execution Fails: "Already executed"
- Upgrade has already been executed
- If rollback needed, use `rollback_upgrade`

### Rollback Fails: "Upgrade not executed"
- Upgrade hasn't been executed yet
- Cannot roll back a proposal that's only scheduled

### Rollback Fails: "Already rolled back"
- Upgrade was already rolled back
- Check proposal's `rolled_back` field

## References

- [Proxy Pattern Implementation](./src/proxy/lib.rs)
- [Upgrade Timelock Module](./src/upgrade_timelock/lib.rs)
- [Admin Multisig](./src/admin/lib.rs)
- [Events Documentation](./EVENTS.md)
- [Storage Versioning](./src/storage_version/lib.rs)

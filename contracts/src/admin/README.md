# Admin Multisig Contract

A secure multi-signature contract for managing critical administrative operations in the Traqora platform.

## Overview

The Admin Multisig contract implements a robust multi-signature scheme requiring multiple authorized signers to approve and execute critical operations such as:
- Emergency stops and resumes
- Contract upgrades
- Parameter changes
- Signer management
- Threshold updates

## Features

- **Multi-Signature Security**: Requires M-of-N signatures (e.g., 2-of-3, 3-of-5)
- **Time-Based Expiration**: Proposals automatically expire after configured period
- **Atomic Execution**: All actions execute atomically after threshold is reached
- **Comprehensive Events**: Full audit trail through contract events
- **Flexible Configuration**: Adjustable signers and thresholds through governance
- **Cancellation Support**: Proposers can cancel their proposals before execution

## Architecture

### Core Components

#### MultisigConfig
Stores the multi-signature configuration:
```rust
pub struct MultisigConfig {
    pub signers: Vec<Address>,           // List of authorized signers
    pub threshold: u32,                  // Required number of approvals
    pub proposal_expiration: u64,        // Time in seconds before expiration
}
```

#### AdminProposal
Represents a proposed admin action:
```rust
pub struct AdminProposal {
    pub proposal_id: u64,
    pub proposer: Address,
    pub action_type: AdminActionType,
    pub target_contract: Option<Address>,
    pub parameter_key: Option<Symbol>,
    pub parameter_value: Option<i128>,
    pub target_address: Option<Address>,
    pub new_threshold: Option<u32>,
    pub proposed_at: u64,
    pub expires_at: u64,
    pub approvals: Vec<Address>,
    pub executed: bool,
    pub cancelled: bool,
}
```

#### AdminActionType
Supported administrative actions:
- `EmergencyStop`: Halt all contract operations
- `EmergencyResume`: Resume operations after emergency stop
- `ParameterChange`: Modify contract parameters
- `ContractUpgrade`: Deploy new contract version
- `AddSigner`: Add new authorized signer
- `RemoveSigner`: Remove existing signer
- `UpdateThreshold`: Change signature threshold

## Usage

### Initialization

```rust
let mut signers = Vec::new(&env);
signers.push_back(signer1);
signers.push_back(signer2);
signers.push_back(signer3);

let threshold = 2;  // 2-of-3 multisig
let proposal_expiration = 86400;  // 24 hours

client.initialize(&signers, &threshold, &proposal_expiration);
```

### Creating a Proposal

```rust
// Emergency stop proposal
let proposal_id = client.propose_admin_action(
    &proposer,
    &AdminActionType::EmergencyStop,
    &None,
    &None,
    &None,
    &None,
    &None,
);

// Parameter change proposal
let proposal_id = client.propose_admin_action(
    &proposer,
    &AdminActionType::ParameterChange,
    &None,
    &Some(Symbol::new(&env, "max_fee")),
    &Some(1000),
    &None,
    &None,
);

// Add signer proposal
let proposal_id = client.propose_admin_action(
    &proposer,
    &AdminActionType::AddSigner,
    &None,
    &None,
    &None,
    &Some(new_signer_address),
    &None,
);
```

### Approving a Proposal

```rust
client.approve_admin_action(&signer, &proposal_id);
```

### Executing a Proposal

```rust
// Execute after threshold is reached
client.execute_admin_action(&executor, &proposal_id);
```

### Cancelling a Proposal

```rust
// Only proposer can cancel
client.cancel_proposal(&proposer, &proposal_id);
```

### Query Functions

```rust
// Get proposal details
let proposal = client.get_proposal(&proposal_id);

// Get multisig configuration
let config = client.get_multisig_config();

// Check if address is a signer
let is_signer = client.is_signer_address(&address);

// Check if signer has approved
let has_approved = client.has_approved(&proposal_id, &signer);

// Check emergency stop status
let is_stopped = client.is_emergency_stopped();

// Get total proposal count
let count = client.get_proposal_count();
```

## Workflow Examples

### Emergency Stop Workflow

```rust
// 1. Signer detects security issue
let proposal_id = client.propose_admin_action(
    &signer1,
    &AdminActionType::EmergencyStop,
    &None, &None, &None, &None, &None,
);

// 2. Other signers review and approve
client.approve_admin_action(&signer2, &proposal_id);

// 3. Execute emergency stop (2-of-3 threshold reached)
client.execute_admin_action(&signer1, &proposal_id);

// 4. Contract operations are now halted
assert!(client.is_emergency_stopped());
```

### Signer Rotation Workflow

```rust
// 1. Propose adding new signer
let add_proposal = client.propose_admin_action(
    &signer1,
    &AdminActionType::AddSigner,
    &None, &None, &None,
    &Some(new_signer),
    &None,
);

// 2. Get approvals
client.approve_admin_action(&signer2, &add_proposal);

// 3. Execute
client.execute_admin_action(&signer1, &add_proposal);

// 4. New signer can now participate
assert!(client.is_signer_address(&new_signer));

// 5. Propose removing old signer
let remove_proposal = client.propose_admin_action(
    &new_signer,
    &AdminActionType::RemoveSigner,
    &None, &None, &None,
    &Some(old_signer),
    &None,
);

// 6. Get approvals and execute
client.approve_admin_action(&signer1, &remove_proposal);
client.execute_admin_action(&new_signer, &remove_proposal);
```

### Threshold Update Workflow

```rust
// 1. Propose increasing threshold from 2 to 3
let proposal_id = client.propose_admin_action(
    &signer1,
    &AdminActionType::UpdateThreshold,
    &None, &None, &None, &None,
    &Some(3),
);

// 2. Get current threshold approvals (2)
client.approve_admin_action(&signer2, &proposal_id);

// 3. Execute with current threshold
client.execute_admin_action(&signer1, &proposal_id);

// 4. Future proposals now require 3 approvals
let config = client.get_multisig_config().unwrap();
assert_eq!(config.threshold, 3);
```

## Events

The contract emits events for monitoring and audit purposes:

- `(admin, init)`: Contract initialized
- `(proposal, created)`: New proposal created
- `(proposal, approved)`: Proposal approved by signer
- `(proposal, cancelled)`: Proposal cancelled
- `(action, executed)`: Action executed
- `(emergency, stopped)`: Emergency stop activated
- `(emergency, resumed)`: Operations resumed
- `(signer, added)`: New signer added
- `(signer, removed)`: Signer removed
- `(threshold, updated)`: Threshold changed
- `(param, changed)`: Parameter changed
- `(upgrade, executed)`: Contract upgraded

## Security Considerations

See [SECURITY.md](./SECURITY.md) for comprehensive security documentation including:
- Threat models
- Best practices
- Attack vectors and mitigations
- Operational procedures
- Incident response

### Key Security Features

1. **Minimum Threshold**: Enforces minimum threshold of 2 for security
2. **Signer Validation**: Cannot remove signers below threshold
3. **Expiration**: Prevents indefinite pending proposals
4. **Authorization**: All operations require proper authentication
5. **Immutability**: Executed proposals cannot be re-executed
6. **Atomic Execution**: All-or-nothing execution model

## Testing

Comprehensive test suite covering:
- Initialization scenarios
- Proposal creation and validation
- Approval workflows
- Execution logic
- Cancellation
- Edge cases and error conditions
- Complex multi-proposal scenarios

Run tests:
```bash
cargo test admin_multisig
```

## Integration

### With Other Contracts

The Admin Multisig contract can manage other contracts by:
1. Storing target contract addresses in proposals
2. Executing cross-contract calls after approval
3. Managing contract parameters through ParameterChange actions
4. Coordinating upgrades across multiple contracts

### Example Integration

```rust
// Manage booking contract parameters
let proposal_id = client.propose_admin_action(
    &proposer,
    &AdminActionType::ParameterChange,
    &Some(booking_contract_address),
    &Some(Symbol::new(&env, "max_booking_fee")),
    &Some(500),
    &None,
    &None,
);
```

## Best Practices

1. **Threshold Selection**: Use 2-of-3 for small teams, 3-of-5 for larger organizations
2. **Key Management**: Store signer keys in hardware wallets or HSMs
3. **Proposal Review**: Always review proposals thoroughly before approval
4. **Expiration Period**: Set appropriate expiration based on action criticality
5. **Monitoring**: Monitor all events for suspicious activity
6. **Documentation**: Document all executed actions and their rationale
7. **Testing**: Test all proposals on testnet before mainnet execution
8. **Backup**: Maintain threshold > 1 to handle key loss

## Limitations

- Proposals cannot be modified after creation (must cancel and recreate)
- Expired proposals cannot be revived (must create new proposal)
- Threshold must be at least 2 (single-signature not supported)
- Signers must be available to reach threshold
- No built-in time-lock for additional security delay

## Future Enhancements

Potential improvements for future versions:
- Time-lock mechanism for critical operations
- Proposal modification support
- Hierarchical permissions (different thresholds for different actions)
- Automated proposal execution after threshold + time-lock
- Integration with hardware security modules
- Support for weighted voting
- Proposal templates for common operations

## License

Part of the Traqora smart contract suite.

# Dispute Resolution Contract

A decentralized dispute resolution system for refund disputes between passengers and airlines using a jury-based voting mechanism with TRQ token holders.

## Overview

The Dispute Resolution Contract enables fair and transparent resolution of refund disputes through a multi-phase process involving evidence submission, jury selection, commit-reveal voting, and automatic execution of verdicts.

## Key Features

### 1. **Dispute Filing with Stakes**
- Passengers can file disputes against airlines for refund requests
- Both parties must stake tokens (minimum 20% of disputed amount by default)
- Stakes are held in escrow until dispute resolution

### 2. **Evidence Submission**
- Time-locked evidence phase (default: 24 hours)
- Both parties can submit evidence as IPFS/content hashes
- Evidence is immutably recorded on-chain with timestamps

### 3. **Decentralized Jury Selection**
- TRQ token holders can volunteer as jurors
- Configurable jury size (default: 5 jurors)
- Parties to the dispute cannot serve as jurors
- First-come-first-served selection based on token holdings

### 4. **Commit-Reveal Voting Scheme**
- **Commit Phase**: Jurors submit hash of their vote + salt
- **Reveal Phase**: Jurors reveal actual vote with salt for verification
- Prevents vote manipulation and ensures fairness
- Time-locked phases prevent late voting

### 5. **Appeal Mechanism**
- Losing party can appeal the verdict
- Requires higher stake (default: 50% of disputed amount)
- Resets dispute to evidence phase with new jury
- Only one appeal allowed per dispute

### 6. **Automatic Reward Distribution**
- Winning jurors (those who voted with majority) receive rewards
- Reward pool comes from losing party's stake (default: 20%)
- Rewards distributed proportionally among winning jurors
- Losing party's stake is slashed

### 7. **Verdict Execution**
- Automatic refund/slash based on jury verdict
- Winner receives disputed amount plus portion of loser's stake
- Loser's stake is distributed to winner and jury reward pool

## Contract Phases

```
1. Evidence Phase
   ├─ Passenger files dispute with stake
   ├─ Airline responds with stake
   └─ Both parties submit evidence

2. Jury Selection Phase
   ├─ TRQ token holders volunteer as jurors
   └─ Jury fills to configured size

3. Commit Vote Phase
   ├─ Jurors submit vote commitments (hash)
   └─ Time-locked to prevent late commits

4. Reveal Vote Phase
   ├─ Jurors reveal votes with salt
   ├─ Votes are verified against commits
   └─ Vote tallies updated

5. Appeal Phase
   ├─ Losing party can file appeal
   └─ Or dispute moves to finalization

6. Finalized Phase
   ├─ Verdict executed
   ├─ Stakes distributed
   └─ Juror rewards claimable
```

## Data Structures

### Dispute
```rust
pub struct Dispute {
    pub dispute_id: u64,
    pub refund_request_id: u64,
    pub passenger: Address,
    pub airline: Address,
    pub amount: i128,
    pub passenger_stake: i128,
    pub airline_stake: i128,
    pub phase: DisputePhase,
    pub evidence_deadline: u64,
    pub voting_deadline: u64,
    pub reveal_deadline: u64,
    pub appeal_deadline: u64,
    pub passenger_evidence_count: u32,
    pub airline_evidence_count: u32,
    pub jury_size: u32,
    pub votes_for_passenger: u32,
    pub votes_for_airline: u32,
    pub verdict: Option<Symbol>,
    pub appealed: bool,
    pub created_at: u64,
    pub finalized_at: Option<u64>,
}
```

### Evidence
```rust
pub struct Evidence {
    pub dispute_id: u64,
    pub submitter: Address,
    pub evidence_hash: BytesN<32>,
    pub description: Symbol,
    pub submitted_at: u64,
}
```

### VoteCommit & VoteReveal
```rust
pub struct VoteCommit {
    pub dispute_id: u64,
    pub juror: Address,
    pub commit_hash: BytesN<32>,
    pub committed_at: u64,
}

pub struct VoteReveal {
    pub dispute_id: u64,
    pub juror: Address,
    pub vote_for_passenger: bool,
    pub salt: BytesN<32>,
    pub revealed_at: u64,
}
```

## Configuration

```rust
pub struct DisputeConfig {
    pub min_stake_percentage: u32,        // Basis points (2000 = 20%)
    pub jury_size: u32,                   // Number of jurors (e.g., 5)
    pub evidence_period: u64,             // Seconds (e.g., 86400 = 1 day)
    pub voting_period: u64,               // Seconds (e.g., 86400 = 1 day)
    pub reveal_period: u64,               // Seconds (e.g., 86400 = 1 day)
    pub appeal_period: u64,               // Seconds (e.g., 86400 = 1 day)
    pub appeal_stake_multiplier: u32,     // Basis points (5000 = 50%)
    pub jury_reward_pool_percentage: u32, // Basis points (2000 = 20%)
}
```

## Key Functions

### Initialization
```rust
pub fn initialize(
    env: Env,
    min_stake_percentage: u32,
    jury_size: u32,
    evidence_period: u64,
    voting_period: u64,
    reveal_period: u64,
    appeal_period: u64,
    appeal_stake_multiplier: u32,
    jury_reward_pool_percentage: u32,
)
```

### Dispute Lifecycle

#### 1. File Dispute
```rust
pub fn file_dispute(
    env: Env,
    passenger: Address,
    airline: Address,
    refund_request_id: u64,
    amount: i128,
    passenger_stake: i128,
) -> u64
```

#### 2. Airline Response
```rust
pub fn airline_respond(
    env: Env,
    airline: Address,
    dispute_id: u64,
    airline_stake: i128,
)
```

#### 3. Submit Evidence
```rust
pub fn submit_evidence(
    env: Env,
    submitter: Address,
    dispute_id: u64,
    evidence_hash: BytesN<32>,
    description: Symbol,
)
```

#### 4. Jury Selection
```rust
pub fn select_as_juror(
    env: Env,
    juror: Address,
    dispute_id: u64,
    token_balance: i128,
)
```

#### 5. Commit Vote
```rust
pub fn commit_vote(
    env: Env,
    juror: Address,
    dispute_id: u64,
    commit_hash: BytesN<32>,
)
```

#### 6. Reveal Vote
```rust
pub fn reveal_vote(
    env: Env,
    juror: Address,
    dispute_id: u64,
    vote_for_passenger: bool,
    salt: BytesN<32>,
)
```

#### 7. Finalize Dispute
```rust
pub fn finalize_dispute(env: Env, dispute_id: u64)
```

#### 8. File Appeal
```rust
pub fn file_appeal(
    env: Env,
    appellant: Address,
    dispute_id: u64,
    appeal_stake: i128,
)
```

#### 9. Execute Verdict
```rust
pub fn execute_verdict(env: Env, dispute_id: u64)
```

#### 10. Claim Juror Reward
```rust
pub fn claim_juror_reward(
    env: Env,
    juror: Address,
    dispute_id: u64,
) -> i128
```

## Security Features

### 1. **Commit-Reveal Pattern**
- Prevents vote manipulation by hiding votes during commit phase
- Uses cryptographic hash (Keccak256) for verification
- Salt ensures uniqueness and prevents rainbow table attacks

### 2. **Time-Locked Phases**
- Each phase has strict deadlines
- Prevents late submissions or vote changes
- Automatic phase transitions based on timestamps

### 3. **Stake Requirements**
- Both parties must stake tokens to participate
- Prevents frivolous disputes
- Economic incentive for honest behavior

### 4. **Jury Incentives**
- Rewards for voting with majority
- No rewards for minority voters
- Encourages careful evidence review

### 5. **Appeal Protection**
- Higher stake required for appeals
- Only one appeal allowed
- Prevents endless dispute cycles

## Usage Example

```rust
// 1. Initialize contract
client.initialize(
    2000,  // 20% min stake
    5,     // 5 jurors
    86400, // 1 day evidence period
    86400, // 1 day voting period
    86400, // 1 day reveal period
    86400, // 1 day appeal period
    5000,  // 50% appeal stake
    2000,  // 20% jury reward pool
);

// 2. Passenger files dispute
let dispute_id = client.file_dispute(
    passenger,
    airline,
    refund_request_id,
    10000,  // disputed amount
    2000,   // 20% stake
);

// 3. Airline responds
client.airline_respond(airline, dispute_id, 2000);

// 4. Submit evidence
client.submit_evidence(
    passenger,
    dispute_id,
    evidence_hash,
    description,
);

// 5. Jurors volunteer
client.select_as_juror(juror1, dispute_id, token_balance);

// 6. Commit votes
let commit_hash = keccak256(vote + salt);
client.commit_vote(juror1, dispute_id, commit_hash);

// 7. Reveal votes
client.reveal_vote(juror1, dispute_id, true, salt);

// 8. Finalize and execute
client.finalize_dispute(dispute_id);
client.execute_verdict(dispute_id);

// 9. Claim rewards
let reward = client.claim_juror_reward(juror1, dispute_id);
```

## Events

The contract emits the following events:

- `("dispute", "init")` - Contract initialized
- `("dispute", "filed")` - New dispute filed
- `("dispute", "responded")` - Airline responded to dispute
- `("evidence", "submitted")` - Evidence submitted
- `("juror", "selected")` - Juror selected
- `("vote", "committed")` - Vote committed
- `("vote", "revealed")` - Vote revealed
- `("phase", "reveal")` - Advanced to reveal phase
- `("dispute", "finalized")` - Dispute finalized with verdict
- `("dispute", "appealed")` - Dispute appealed
- `("verdict", "executed")` - Verdict executed
- `("reward", "claimed")` - Juror reward claimed

## Integration with Other Contracts

### Refund Contract
The dispute contract integrates with the refund contract to handle disputed refund requests. When a refund is disputed, the refund contract should:
1. Lock the refund amount
2. Create a dispute via this contract
3. Wait for verdict execution
4. Process refund or rejection based on verdict

### Token Contract
The dispute contract requires integration with the TRQ token contract for:
1. Verifying juror token balances
2. Locking stakes from both parties
3. Distributing rewards to winning jurors
4. Slashing losing party's stake

### Governance Contract
Future integration could allow governance to:
1. Update dispute configuration parameters
2. Modify jury size and time periods
3. Adjust stake and reward percentages

## Testing

Comprehensive tests are provided in `/tests/dispute_test.rs` covering:

- ✅ Contract initialization
- ✅ Dispute filing with stake validation
- ✅ Airline response
- ✅ Evidence submission by both parties
- ✅ Jury selection and validation
- ✅ Commit-reveal voting mechanism
- ✅ Vote verification
- ✅ Dispute finalization
- ✅ Appeal mechanism
- ✅ Verdict execution
- ✅ Juror reward distribution
- ✅ Complete dispute lifecycle
- ✅ Error cases and edge conditions

Run tests with:
```bash
cargo test dispute_test
```

## Future Enhancements

1. **Weighted Jury Selection**: Select jurors based on token holdings and reputation
2. **Reputation System**: Track juror accuracy and reward consistent fair voters
3. **Multi-Round Appeals**: Allow multiple appeal rounds with increasing stakes
4. **Partial Verdicts**: Support partial refunds based on evidence strength
5. **Arbitration Pool**: Pre-selected pool of expert arbitrators
6. **Cross-Chain Evidence**: Support evidence from multiple blockchains
7. **AI Evidence Analysis**: Optional AI-assisted evidence review for jurors
8. **Dispute Categories**: Different rules for different dispute types

## License

Part of the Traqora decentralized airline booking platform.

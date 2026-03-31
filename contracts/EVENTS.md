# Traqora Contract Events

All events follow a standard schema for consistent off-chain indexing and monitoring.

## Standard Event Schema

```
topics: (contract_topic: symbol, action_topic: symbol)
data:   (actor: Address, timestamp: u64, primary_id: u64, ...action_specific_payload)
```

- `contract_topic` — identifies the contract domain (e.g. `booking`, `refund`, `loyalty`)
- `action_topic` — identifies the action (e.g. `created`, `paid`, `approved`)
- `actor` — the address that triggered the action (passenger, airline, oracle, etc.)
- `timestamp` — ledger timestamp at the time of the event (`env.ledger().timestamp()`)
- `primary_id` — the main entity ID (booking_id, request_id, etc.)
- additional payload fields are action-specific (see tables below)

---

## FlightBooking Contract (`booking`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(booking, created)`        | `(passenger, timestamp, booking_id, airline, flight_number, price)`      | New booking created in pending state     |
| `(booking, paid)`           | `(passenger, timestamp, booking_id, amount)`                             | Payment escrowed; booking confirmed      |
| `(booking, released)`       | `(airline \| oracle, timestamp, booking_id, amount)`                     | Escrow released to airline post-flight   |
| `(booking, refunded)`       | `(passenger \| oracle, timestamp, booking_id, amount)`                   | Escrow refunded to passenger             |
| `(booking, oracle)`         | `(admin, timestamp, oracle_address)`                                     | Trusted oracle address registered        |

### Querying via Stellar SDK (JavaScript)

```js
const server = new StellarSdk.SorobanRpc.Server(rpcUrl);
const events = await server.getEvents({
  startLedger: fromLedger,
  filters: [{
    type: "contract",
    contractIds: [BOOKING_CONTRACT_ID],
    topics: [
      [StellarSdk.xdr.ScVal.scvSymbol("booking")],
      [StellarSdk.xdr.ScVal.scvSymbol("created")],
    ],
  }],
});
```

---

## RefundAutomation Contract (`refund`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(policy, set)`             | `(airline, timestamp, cancellation_window, full_refund_pct)`             | Airline refund policy configured         |
| `(refund, requested)`       | `(passenger, timestamp, request_id, booking_id, amount)`                 | Refund request submitted                 |
| `(refund, approved)`        | `(passenger, timestamp, request_id, booking_id, amount)`                 | Refund approved; backend should transfer |
| `(refund, rejected)`        | `(passenger, timestamp, request_id, booking_id, reason)`                 | Refund request rejected                  |

---

## LoyaltyProgram Contract (`loyalty` / `points` / `tier`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(loyalty, init)`           | `timestamp`                                                              | Tier configurations initialized          |
| `(points, earned)`          | `(user, timestamp, points, booking_id)`                                  | Points awarded for a booking             |
| `(points, accrued)`         | `(passenger, timestamp, amount, flight_id)`                              | Points accrued for a flight              |
| `(points, redeemed)`        | `(user, timestamp, points, discount)`                                    | Points redeemed for a discount           |
| `(tier, upgrade)`           | `(user, timestamp, new_tier)`                                            | User tier upgraded                       |

---

## DisputeResolution Contract (`dispute` / `evidence` / `vote` / `juror`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(dispute, init)`           | `jury_size`                                                              | Contract initialized                     |
| `(dispute, filed)`          | `(dispute_id, passenger, airline, amount)`                               | New dispute filed                        |
| `(dispute, responded)`      | `(dispute_id, airline, stake)`                                           | Airline responded to dispute             |
| `(evidence, submitted)`     | `(dispute_id, submitter, evidence_hash)`                                 | Evidence submitted                       |
| `(juror, selected)`         | `(dispute_id, juror)`                                                    | Juror selected for dispute               |
| `(vote, committed)`         | `(dispute_id, juror)`                                                    | Vote committed (hash)                    |
| `(vote, revealed)`          | `(dispute_id, juror, vote_for_passenger)`                                | Vote revealed                            |
| `(dispute, finalized)`      | `(dispute_id, verdict)`                                                  | Dispute finalized with verdict           |
| `(dispute, appealed)`       | `(dispute_id, appellant)`                                                | Dispute appealed                         |
| `(verdict, executed)`       | `(dispute_id, verdict)`                                                  | Verdict executed and funds distributed   |
| `(reward, claimed)`         | `(dispute_id, juror, amount)`                                            | Juror reward claimed                     |

---

## AdminMultisig Contract (`admin` / `proposal` / `action`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(admin, init)`             | `threshold`                                                              | Multisig initialized                     |
| `(proposal, created)`       | `(proposal_id, action_type)`                                             | New proposal created                     |
| `(proposal, approved)`      | `(proposal_id, signer)`                                                  | Proposal approved by signer              |
| `(proposal, cancelled)`     | `(proposal_id, canceller)`                                               | Proposal cancelled                       |
| `(action, executed)`        | `(proposal_id, action_type)`                                             | Proposal executed                        |
| `(emergency, stopped)`      | `(target_contract, actor)`                                               | Emergency stop activated                 |
| `(emergency, resumed)`      | `(target_contract, actor)`                                               | Operations resumed                       |
| `(signer, added)`           | `new_signer`                                                             | New signer added                         |
| `(signer, removed)`         | `removed_signer`                                                         | Signer removed                           |
| `(threshold, updated)`      | `new_threshold`                                                          | Approval threshold changed               |
| `(param, changed)`          | `(key, old_value, new_value)`                                            | Contract parameter changed               |
| `(upgrade, executed)`       | `target_contract`                                                        | Contract upgraded                        |

---

## Querying Events via Stellar SDK

Events are queryable using the Soroban RPC `getEvents` endpoint. All events are emitted as
`contract` type events and are indexed by contract ID and topic.

```js
// Generic helper — works for any contract/action pair
async function getContractEvents(contractId, topicA, topicB, fromLedger) {
  const server = new StellarSdk.SorobanRpc.Server(RPC_URL);
  return server.getEvents({
    startLedger: fromLedger,
    filters: [{
      type: "contract",
      contractIds: [contractId],
      topics: [
        [StellarSdk.xdr.ScVal.scvSymbol(topicA)],
        [StellarSdk.xdr.ScVal.scvSymbol(topicB)],
      ],
    }],
  });
}

// Example: watch for all refund approvals
const refundApprovals = await getContractEvents(
  REFUND_CONTRACT_ID, "refund", "approved", startLedger
);
```

### Rust (soroban-client)

```rust
let events = server.get_events(GetEventsRequest {
    start_ledger: from_ledger,
    filters: vec![EventFilter {
        event_type: EventType::Contract,
        contract_ids: vec![booking_contract_id],
        topics: vec![
            vec![ScVal::Symbol("booking".into())],
            vec![ScVal::Symbol("created".into())],
        ],
    }],
    ..Default::default()
}).await?;
```

---

## Notes

- All `symbol_short!` topics are limited to 9 characters (Soroban constraint).
- `timestamp` in event data is `env.ledger().timestamp()` — Unix seconds, same as ledger close time.
- Events are not stored on-chain beyond the ledger's event retention window; index them promptly.
- The `actor` field enables attribution for audit trails without requiring additional lookups.

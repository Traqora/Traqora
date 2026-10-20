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

> This file is checked for drift against the contract sources. Run
> `./scripts/check-events-docs.sh` (or `cargo test -p events-docs-check`) after
> adding, renaming, or removing an event so the tables below stay accurate.

---

## FlightBooking Contract (`booking`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(booking, created)`        | `(passenger, timestamp, booking_id, airline, flight_number, price)`      | New booking created in pending state     |
| `(booking, paid)`           | `(passenger, timestamp, booking_id, amount)`                             | Payment escrowed; booking confirmed      |
| `(booking, released)`       | `(airline \| oracle, timestamp, booking_id, amount)`                     | Escrow released to airline post-flight   |
| `(booking, refunded)`       | `(passenger \| oracle, timestamp, booking_id, amount)`                   | Escrow refunded to passenger             |
| `(booking, cancelled)`      | `(booking_id, passenger_refund, airline_amount)`                         | Booking cancelled; escrow split          |
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

## Refund Contract (`refund`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(policy, set)`             | `(airline, timestamp, cancellation_window, full_refund_pct)`             | Airline refund policy configured         |
| `(refund, requested)`       | `(passenger, timestamp, request_id, booking_id, amount)`                 | Refund request submitted                 |
| `(refund, approved)`        | `(passenger, timestamp, request_id, booking_id, amount)`                 | Refund approved; backend should transfer |
| `(refund, rejected)`        | `(passenger, timestamp, request_id, booking_id, reason)`                 | Refund request rejected                  |

## RefundAutomation Contract (`refund`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(refund, cancelled)`       | `(booking_id, tier, passenger_refund, airline_amount, caller, numeric_id)` | Booking cancelled via automation       |
| `(refund, automated)`       | `(booking_id, tier, passenger_refund, airline_amount, reason)`           | Refund automated for a booking           |
| `(refund, batch)`           | `(admin, timestamp, processed)`                                          | Batch of refunds processed               |
| `(refund, dispute)`         | `(passenger, refund_id, booking_numeric_id, timestamp)`                  | Automated refund disputed                |
| `(refund, resolved)`        | `(admin, refund_id, resolution, timestamp)`                              | Disputed refund resolved                 |

### Idempotency guarantees

The automated cancel/refund entry points are idempotent per booking. A booking is marked cancelled
on the first successful `cancel_booking` or `automate_refund`, and any subsequent call for the same
booking panics with `Booking already cancelled`. This prevents double settlement (paying the
passenger/airline twice) and duplicate refund requests if an operator or automation retries a
policy action.

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
| `(juror, selected)`         | `(dispute_id, juror, token_balance)`                                     | Juror selected for dispute               |
| `(vote, committed)`         | `(dispute_id, juror)`                                                    | Vote committed (hash)                    |
| `(vote, revealed)`          | `(dispute_id, juror, vote_for_passenger)`                                | Vote revealed                            |
| `(phase, voting)`           | `dispute_id`                                                             | Advanced to voting after evidence timeout|
| `(phase, reveal)`           | `dispute_id`                                                             | Advanced to reveal phase                 |
| `(dispute, finalized)`      | `(dispute_id, verdict)`                                                  | Dispute finalized with verdict           |
| `(dispute, appealed)`       | `(dispute_id, appellant, appeal_stake)`                                  | Dispute appealed                         |
| `(verdict, executed)`       | `(dispute_id, winner, loser, amount, jury_reward_pool)`                  | Verdict executed and funds distributed   |
| `(reward, claimed)`         | `(dispute_id, juror, amount)`                                            | Juror reward claimed                     |

---

## AdminMultisig Contract (`admin` / `proposal` / `action`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(admin, init)`             | `threshold`                                                              | Multisig initialized                     |
| `(proposal, created)`       | `(proposal_id, action_type)`                                             | New proposal created                     |
| `(proposal, approved)`      | `(proposal_id, signer)`                                                  | Proposal approved by signer              |
| `(proposal, cancelled)`     | `proposal_id`                                                            | Proposal cancelled                       |
| `(action, executed)`        | `(proposal_id, action_type)`                                             | Proposal executed                        |
| `(emergency, stopped)`      | `proposal_id`                                                            | Emergency stop activated                 |
| `(emergency, resumed)`      | `proposal_id`                                                            | Operations resumed                       |
| `(signer, added)`           | `(proposal_id, new_signer)`                                              | New signer added                         |
| `(signer, removed)`         | `(proposal_id, removed_signer)`                                          | Signer removed                           |
| `(threshold, updated)`      | `(proposal_id, new_threshold)`                                           | Approval threshold changed               |
| `(param, changed)`          | `(proposal_id, key, value)`                                              | Contract parameter changed               |
| `(upgrade, executed)`       | `proposal_id`                                                            | Upgrade proposal executed                |

---

## Airline Contract (`pricing` / `airline` / `flight`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(pricing, init)`           | `(admin, oracle, max_change_bps, cooldown_secs)`                         | Dynamic pricing configured               |
| `(pricing, oracle)`         | `(admin, oracle)`                                                        | Price oracle updated                     |
| `(airline, reg)`            | `airline`                                                                | Airline registered                       |
| `(airline, verified)`       | `airline`                                                                | Airline verified by admin                |
| `(flight, created)`         | `flight_id`                                                              | Flight listing created                   |
| `(flight, cancelled)`       | `flight_id`                                                              | Flight listing cancelled                 |
| `(flight, status)`          | `flight_id`                                                              | Flight status updated                    |
| `(flight, price)`           | `(flight_id, old_price, new_price, oracle)`                              | Flight price updated                     |

---

## Oracle Contract (`oracle`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(oracle, init)`            | `(owner, min_stake, consensus_threshold)`                                | Oracle network initialized               |
| `(oracle, provider)`        | `(provider, stake)`                                                      | Oracle provider registered               |
| `(oracle, status)`          | `(flight_number, booking_id, status, provider)`                          | Flight status submitted by provider      |
| `(oracle, settled)`         | `(booking_id, status)`                                                   | Booking settled by consensus             |
| `(oracle, refunded)`        | `(booking_id, status)`                                                   | Booking refunded by consensus            |

---

## Token Contract (`token` / `mint` / `transfer` / `approve` / `tr_from`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(token, init)`             | `(admin, symbol)`                                                        | Token initialized                        |
| `(mint, success)`           | `(to, amount)`                                                           | Tokens minted                            |
| `(transfer, success)`       | `(from, to, amount)`                                                     | Tokens transferred                       |
| `(approve, success)`        | `(owner, spender, amount)`                                               | Allowance approved                       |
| `(tr_from, success)`        | `(from, to, amount)`                                                     | Transfer-from (spender) executed         |

---

## BookingReceipt Contract (`mint`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(mint, success)`           | `(to, receipt_id, booking_id)`                                           | Booking receipt NFT minted               |

---

## FlightRegistry Contract (`airline` / `flight`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(airline, reg, airline_id)`| `(admin, name)`                                                          | Airline registry entry created           |
| `(flight, added, flight_id)`| `(airline_id, airline_admin)`                                            | Flight added to registry                 |

---

## DisputeResolution (Arbiter) Contract (`dispute`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(dispute, opened)`         | `(dispute_id, claimant)`                                                 | Arbiter dispute opened                   |
| `(dispute, counter)`        | `(dispute_id, respondent)`                                               | Respondent countered                     |
| `(dispute, resolved)`       | `(dispute_id, arbiter, winner, payout_amount)`                           | Arbiter resolved the dispute             |

---

## Proxy Contract (`proxy` / `upgrade` / `storage` / `multisig`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(proxy, init)`             | `(admin, implementation, threshold)`                                     | Proxy initialized                        |
| `(upgrade, proposed)`       | `(proposal_id, new_implementation)`                                      | Upgrade proposed                         |
| `(upgrade, approved)`       | `(proposal_id, signer)`                                                  | Upgrade approved by signer               |
| `(upgrade, executed)`       | `(proposal_id, version, old_implementation, new_implementation)`         | Upgrade executed                         |
| `(proxy, paused)`           | `admin`                                                                  | Proxy paused                             |
| `(proxy, unpaused)`         | `admin`                                                                  | Proxy resumed                            |
| `(storage, migrated)`       | `(from_version, to_version)`                                             | Storage migration performed              |
| `(multisig, updated)`       | `new_threshold`                                                          | Multisig threshold updated               |

---

## Upgrade Contract (`upgrade`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(upgrade, scheduled)`      | `(new_wasm_hash, current_time, admin)`                                   | Upgrade scheduled                        |
| `(upgrade, executed)`       | `(new_wasm_hash, current_time, admin)`                                   | Upgrade executed                         |
| `(upgrade, timelock)`       | `(duration, owner)`                                                      | Timelock duration configured             |
| `(upgrade, cancelled)`      | `(new_wasm_hash, owner)`                                                 | Scheduled upgrade cancelled              |

---

## Governance Contract (`proposal` / `vote`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(proposal, created)`       | `proposal_id`                                                            | Governance proposal created              |
| `(vote, cast)`              | `(proposal_id, voter, support)`                                          | Governance vote cast                     |
| `(proposal, executed)`      | `(proposal_id, status)`                                                  | Governance proposal executed             |

---

## StorageVersion Contract (`mig`)

| topics                      | data fields                                                              | description                              |
|-----------------------------|--------------------------------------------------------------------------|------------------------------------------|
| `(mig, step_beg)`           | `(contract_type, from, to)`                                              | Migration step started                   |
| `(mig, step_end)`           | `(contract_type, from, to)`                                              | Migration step finished                  |

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
